-- ============================================================
--  삼기연 홈페이지 — 통합 DB 설정 (이 파일 하나만 실행하면 됩니다)
--  ▶ Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run
--  ▶ 순서대로 안전하게 만들어지며, 여러 번 실행해도 문제 없습니다.
--  ▶ 회원 · 갤러리 게시판 · 회원탈퇴 · 관리자(회장위임) · 임원방 전부 포함.
-- ============================================================

-- ============ 1. 회원 프로필 ============
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text, name text, address text, phone text, church text,
  member_type  text default '일반회원',
  officer_role text,
  created_at   timestamptz default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, address, phone, church, member_type)
  values (new.id, new.email,
    new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'phone', new.raw_user_meta_data ->> 'church',
    coalesce(new.raw_user_meta_data ->> 'member_type', '일반회원'))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ 2. 권한 판별 함수 (profiles 생성 후) ============
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.officer_role = '회장');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

create or replace function public.is_officer()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.officer_role is not null);
$$;
revoke all on function public.is_officer() from public;
grant execute on function public.is_officer() to authenticated;

-- ============ 3. profiles 접근 권한 ============
drop policy if exists "own_select" on public.profiles;
create policy "own_select" on public.profiles for select using ( auth.uid() = id );
drop policy if exists "admin_select" on public.profiles;
create policy "admin_select" on public.profiles for select using ( public.is_admin() );
drop policy if exists "admin_update" on public.profiles;
create policy "admin_update" on public.profiles for update using ( public.is_admin() );
drop policy if exists "own_update" on public.profiles;
create policy "own_update" on public.profiles for update using ( auth.uid() = id ) with check ( auth.uid() = id );

-- 임원 직책(officer_role)은 최고관리자만 변경 가능
create or replace function public.protect_officer_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt() ->> 'email'), '') <> 'kds08200820@gmail.com' then
    new.officer_role := old.officer_role;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_officer on public.profiles;
create trigger trg_protect_officer before update on public.profiles
  for each row execute function public.protect_officer_role();

-- 회원 탈퇴(본인 계정 삭제)
create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin delete from auth.users where id = auth.uid(); end; $$;
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- 기존 가입자 프로필 백필
insert into public.profiles (id, email, name, address, phone, church, member_type)
select id, email, raw_user_meta_data ->> 'name', raw_user_meta_data ->> 'address',
       raw_user_meta_data ->> 'phone', raw_user_meta_data ->> 'church',
       coalesce(raw_user_meta_data ->> 'member_type', '일반회원')
from auth.users on conflict (id) do nothing;

-- ============ 4. 갤러리 사진 ============
create table if not exists public.gallery_photos (
  id uuid default gen_random_uuid() primary key,
  path text not null, url text not null, caption text,
  uploader_id uuid references auth.users(id) on delete set null,
  uploader_name text, created_at timestamptz default now()
);
alter table public.gallery_photos enable row level security;

-- ============ 5. 갤러리 게시글/댓글/반응 ============
create table if not exists public.gallery_posts (
  id uuid default gen_random_uuid() primary key,
  title text not null, event_name text, event_date date, body text,
  author_id uuid references auth.users(id) on delete set null,
  author_name text, created_at timestamptz default now()
);
alter table public.gallery_posts enable row level security;

alter table public.gallery_photos add column if not exists post_id uuid references public.gallery_posts(id) on delete cascade;
alter table public.gallery_photos add column if not exists sort int default 0;

create table if not exists public.gallery_comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.gallery_posts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text, body text not null, created_at timestamptz default now()
);
alter table public.gallery_comments enable row level security;

create table if not exists public.gallery_reactions (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.gallery_posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  emoji text not null, created_at timestamptz default now(),
  unique (post_id, user_id, emoji)
);
alter table public.gallery_reactions enable row level security;

-- 갤러리 권한
drop policy if exists "gp_read" on public.gallery_photos;
create policy "gp_read" on public.gallery_photos for select using ( true );
drop policy if exists "gp_insert" on public.gallery_photos;
create policy "gp_insert" on public.gallery_photos for insert to authenticated with check (
  uploader_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.member_type = '정회원') );
drop policy if exists "gp_delete" on public.gallery_photos;
create policy "gp_delete" on public.gallery_photos for delete to authenticated using ( uploader_id = auth.uid() or public.is_admin() );

drop policy if exists "post_read" on public.gallery_posts;
create policy "post_read" on public.gallery_posts for select using ( true );
drop policy if exists "post_insert" on public.gallery_posts;
create policy "post_insert" on public.gallery_posts for insert to authenticated with check (
  author_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.member_type = '정회원') );
drop policy if exists "post_update" on public.gallery_posts;
create policy "post_update" on public.gallery_posts for update to authenticated
  using ( author_id = auth.uid() or public.is_admin() ) with check ( author_id = auth.uid() or public.is_admin() );
drop policy if exists "post_delete" on public.gallery_posts;
create policy "post_delete" on public.gallery_posts for delete to authenticated using ( author_id = auth.uid() or public.is_admin() );

drop policy if exists "cmt_read" on public.gallery_comments;
create policy "cmt_read" on public.gallery_comments for select using ( true );
drop policy if exists "cmt_insert" on public.gallery_comments;
create policy "cmt_insert" on public.gallery_comments for insert to authenticated with check ( author_id = auth.uid() );
drop policy if exists "cmt_delete" on public.gallery_comments;
create policy "cmt_delete" on public.gallery_comments for delete to authenticated using ( author_id = auth.uid() or public.is_admin() );

drop policy if exists "rx_read" on public.gallery_reactions;
create policy "rx_read" on public.gallery_reactions for select using ( true );
drop policy if exists "rx_insert" on public.gallery_reactions;
create policy "rx_insert" on public.gallery_reactions for insert to authenticated with check ( user_id = auth.uid() );
drop policy if exists "rx_delete" on public.gallery_reactions;
create policy "rx_delete" on public.gallery_reactions for delete to authenticated using ( user_id = auth.uid() );

-- 기존 사진을 게시글로 묶기
do $$
declare g record; pid uuid;
begin
  for g in
    select uploader_id, max(uploader_name) as uploader_name,
           coalesce(nullif(btrim(caption), ''), '갤러리 사진') as ttl,
           (created_at)::date as d, min(created_at) as first_at
    from public.gallery_photos where post_id is null
    group by uploader_id, coalesce(nullif(btrim(caption), ''), '갤러리 사진'), (created_at)::date
  loop
    insert into public.gallery_posts (title, event_name, event_date, author_id, author_name, created_at)
    values (g.ttl, null, g.d, g.uploader_id, g.uploader_name, g.first_at) returning id into pid;
    update public.gallery_photos set post_id = pid
    where post_id is null and uploader_id is not distinct from g.uploader_id
      and coalesce(nullif(btrim(caption), ''), '갤러리 사진') = g.ttl and (created_at)::date = g.d;
  end loop;
end $$;

-- ============ 6. 임원방 (회의 게시판 + 자료방) ============
create table if not exists public.officer_posts (
  id uuid default gen_random_uuid() primary key,
  title text not null, meeting_date date, body text,
  author_id uuid references auth.users(id) on delete set null,
  author_name text, created_at timestamptz default now()
);
alter table public.officer_posts enable row level security;
drop policy if exists "op_read" on public.officer_posts;
create policy "op_read" on public.officer_posts for select to authenticated using ( public.is_officer() );
drop policy if exists "op_insert" on public.officer_posts;
create policy "op_insert" on public.officer_posts for insert to authenticated with check ( author_id = auth.uid() and public.is_officer() );
drop policy if exists "op_update" on public.officer_posts;
create policy "op_update" on public.officer_posts for update to authenticated using ( author_id = auth.uid() or public.is_admin() ) with check ( author_id = auth.uid() or public.is_admin() );
drop policy if exists "op_delete" on public.officer_posts;
create policy "op_delete" on public.officer_posts for delete to authenticated using ( author_id = auth.uid() or public.is_admin() );

create table if not exists public.officer_comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.officer_posts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text, body text not null, created_at timestamptz default now()
);
alter table public.officer_comments enable row level security;
drop policy if exists "oc_read" on public.officer_comments;
create policy "oc_read" on public.officer_comments for select to authenticated using ( public.is_officer() );
drop policy if exists "oc_insert" on public.officer_comments;
create policy "oc_insert" on public.officer_comments for insert to authenticated with check ( author_id = auth.uid() and public.is_officer() );
drop policy if exists "oc_delete" on public.officer_comments;
create policy "oc_delete" on public.officer_comments for delete to authenticated using ( author_id = auth.uid() or public.is_admin() );

create table if not exists public.officer_files (
  id uuid default gen_random_uuid() primary key,
  title text, name text not null, path text not null, url text not null,
  size bigint, mime text,
  author_id uuid references auth.users(id) on delete set null,
  author_name text, created_at timestamptz default now()
);
alter table public.officer_files enable row level security;
drop policy if exists "of_read" on public.officer_files;
create policy "of_read" on public.officer_files for select to authenticated using ( public.is_officer() );
drop policy if exists "of_insert" on public.officer_files;
create policy "of_insert" on public.officer_files for insert to authenticated with check ( author_id = auth.uid() and public.is_officer() );
drop policy if exists "of_delete" on public.officer_files;
create policy "of_delete" on public.officer_files for delete to authenticated using ( author_id = auth.uid() or public.is_admin() );
