-- ============================================================
--  삼기연 — 사모/사부(목회자 배우자) 가입 + 사모 게시판
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 먼저 setup-all.sql 이 실행되어 있어야 합니다. 재실행해도 안전합니다.
-- ============================================================

-- 1) 가입 구분(담임목사/사모/사부) 컬럼
alter table public.profiles add column if not exists member_kind text default '담임목사';

-- 2) 배우자 정회원 판별 함수
--    해당 교회 담임목사가 '정회원'으로 가입돼 있고 주소가 같으면 true
create or replace function public.spouse_member_check(p_church text, p_address text)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists(
    select 1 from public.profiles pr
    where pr.church = p_church
      and pr.member_type = '정회원'
      and coalesce(pr.member_kind, '담임목사') = '담임목사'
      and regexp_replace(coalesce(pr.address, ''), '\s', '', 'g')
        = regexp_replace(coalesce(p_address, ''), '\s', '', 'g')
  );
$$;
revoke all on function public.spouse_member_check(text, text) from public;
grant execute on function public.spouse_member_check(text, text) to anon, authenticated;

-- 3) 신규 가입 처리: officer_role 은 담임목사 정회원에게만 자동 부여, member_kind 반영
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mt text; v_kind text; v_role text;
begin
  v_mt   := coalesce(new.raw_user_meta_data ->> 'member_type', '일반회원');
  v_kind := coalesce(new.raw_user_meta_data ->> 'member_kind', '담임목사');
  if v_mt = '정회원' and v_kind = '담임목사' then
    select officer_role into v_role from public.church_officers
      where church = (new.raw_user_meta_data ->> 'church');
  end if;
  insert into public.profiles (id, email, name, address, phone, church, member_type, officer_role, member_kind)
  values (
    new.id, new.email,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'church',
    v_mt, v_role, v_kind
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- 4) 사모/사부 여부 판별 (게시판 접근용)
create or replace function public.is_samo()
returns boolean language sql security definer set search_path = public stable
as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.member_kind in ('사모','사부'));
$$;
revoke all on function public.is_samo() from public;
grant execute on function public.is_samo() to authenticated;

-- 5) 사모 게시판 (글 · 댓글) — 사모/사부 전용, 익명 옵션
create table if not exists public.samo_posts (
  id          uuid default gen_random_uuid() primary key,
  title       text not null,
  body        text,
  anonymous   boolean default false,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  created_at  timestamptz default now()
);
alter table public.samo_posts enable row level security;
drop policy if exists "sp_read" on public.samo_posts;
create policy "sp_read" on public.samo_posts for select to authenticated using ( public.is_samo() );
drop policy if exists "sp_insert" on public.samo_posts;
create policy "sp_insert" on public.samo_posts for insert to authenticated with check ( author_id = auth.uid() and public.is_samo() );
drop policy if exists "sp_update" on public.samo_posts;
create policy "sp_update" on public.samo_posts for update to authenticated using ( author_id = auth.uid() ) with check ( author_id = auth.uid() );
drop policy if exists "sp_delete" on public.samo_posts;
create policy "sp_delete" on public.samo_posts for delete to authenticated using ( author_id = auth.uid() or public.is_admin() );

create table if not exists public.samo_comments (
  id          uuid default gen_random_uuid() primary key,
  post_id     uuid references public.samo_posts(id) on delete cascade,
  body        text not null,
  anonymous   boolean default false,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  created_at  timestamptz default now()
);
alter table public.samo_comments enable row level security;
drop policy if exists "sc_read" on public.samo_comments;
create policy "sc_read" on public.samo_comments for select to authenticated using ( public.is_samo() );
drop policy if exists "sc_insert" on public.samo_comments;
create policy "sc_insert" on public.samo_comments for insert to authenticated with check ( author_id = auth.uid() and public.is_samo() );
drop policy if exists "sc_delete" on public.samo_comments;
create policy "sc_delete" on public.samo_comments for delete to authenticated using ( author_id = auth.uid() or public.is_admin() );
