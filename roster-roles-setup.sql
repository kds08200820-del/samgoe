-- ============================================================
--  삼기연 — 교회별 임원 직책 사전지정 + 가입 시 자동부여
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 최고관리자가 49개 교회 명단에서 미리 직책을 지정해두면,
--    그 교회 담임목사가 가입(정회원)할 때 자동으로 그 직책이 부여됩니다.
--  ▶ 먼저 setup-all.sql 이 실행되어 있어야 합니다. 재실행해도 안전합니다.
-- ============================================================

-- 1) 교회별 임원 직책 (담임목사 가입 전에도 미리 지정 가능)
create table if not exists public.church_officers (
  church       text primary key,   -- 교회명 (churches.js 의 name 과 동일)
  officer_role text,               -- 회장/부회장/… (없으면 NULL)
  pastor       text,               -- 담임목사명(참고용)
  updated_at   timestamptz default now()
);
alter table public.church_officers enable row level security;

-- 읽기: 관리자(최고관리자 또는 회장)
drop policy if exists "co_read" on public.church_officers;
create policy "co_read" on public.church_officers for select to authenticated using ( public.is_admin() );

-- 지정/변경/삭제: 최고관리자만
drop policy if exists "co_insert" on public.church_officers;
create policy "co_insert" on public.church_officers for insert to authenticated
  with check ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );
drop policy if exists "co_update" on public.church_officers;
create policy "co_update" on public.church_officers for update to authenticated
  using ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );
drop policy if exists "co_delete" on public.church_officers;
create policy "co_delete" on public.church_officers for delete to authenticated
  using ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );

-- 2) 신규 가입 시: 정회원이면 교회에 사전지정된 직책을 자동 부여
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mt text; v_role text;
begin
  v_mt := coalesce(new.raw_user_meta_data ->> 'member_type', '일반회원');
  if v_mt = '정회원' then
    select officer_role into v_role from public.church_officers
      where church = (new.raw_user_meta_data ->> 'church');
  end if;
  insert into public.profiles (id, email, name, address, phone, church, member_type, officer_role)
  values (
    new.id, new.email,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'church',
    v_mt, v_role
  )
  on conflict (id) do nothing;
  return new;
end; $$;
