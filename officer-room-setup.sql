-- ============================================================
--  삼기연 임원방 — 임원회의 게시판 + 임원 자료방
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 먼저 db-setup.sql, admin-president.sql 이 실행되어 있어야 합니다.
--  ▶ 임원방 데이터는 '임원(officer_role 지정된 회원)'만 읽고 쓸 수 있습니다.
--  ▶ 재실행해도 안전합니다.
-- ============================================================

-- 0) 임원 판별 함수 (임원 직책이 있거나 최고관리자)
create or replace function public.is_officer()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select
    coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.officer_role is not null
    );
$$;
revoke all on function public.is_officer() from public;
grant execute on function public.is_officer() to authenticated;

-- ============================================================
-- 1) 임원회의 게시판
-- ============================================================
create table if not exists public.officer_posts (
  id           uuid default gen_random_uuid() primary key,
  title        text not null,
  meeting_date date,
  body         text,
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text,
  created_at   timestamptz default now()
);
alter table public.officer_posts enable row level security;

drop policy if exists "op_read" on public.officer_posts;
create policy "op_read" on public.officer_posts for select to authenticated using ( public.is_officer() );

drop policy if exists "op_insert" on public.officer_posts;
create policy "op_insert" on public.officer_posts for insert to authenticated with check (
  author_id = auth.uid() and public.is_officer() );

drop policy if exists "op_update" on public.officer_posts;
create policy "op_update" on public.officer_posts for update to authenticated
  using ( author_id = auth.uid() or public.is_admin() )
  with check ( author_id = auth.uid() or public.is_admin() );

drop policy if exists "op_delete" on public.officer_posts;
create policy "op_delete" on public.officer_posts for delete to authenticated using (
  author_id = auth.uid() or public.is_admin() );

-- 임원회의 댓글
create table if not exists public.officer_comments (
  id          uuid default gen_random_uuid() primary key,
  post_id     uuid references public.officer_posts(id) on delete cascade,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  body        text not null,
  created_at  timestamptz default now()
);
alter table public.officer_comments enable row level security;

drop policy if exists "oc_read" on public.officer_comments;
create policy "oc_read" on public.officer_comments for select to authenticated using ( public.is_officer() );

drop policy if exists "oc_insert" on public.officer_comments;
create policy "oc_insert" on public.officer_comments for insert to authenticated with check (
  author_id = auth.uid() and public.is_officer() );

drop policy if exists "oc_delete" on public.officer_comments;
create policy "oc_delete" on public.officer_comments for delete to authenticated using (
  author_id = auth.uid() or public.is_admin() );

-- ============================================================
-- 2) 임원 자료방 (파일 게시판 · 파일은 Cloudflare R2 에 저장)
-- ============================================================
create table if not exists public.officer_files (
  id          uuid default gen_random_uuid() primary key,
  title       text,
  name        text not null,          -- 원본 파일명
  path        text not null,          -- R2 key (예: officer/<uid>/...)
  url         text not null,          -- 다운로드 URL (Worker /f/<key>)
  size        bigint,
  mime        text,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  created_at  timestamptz default now()
);
alter table public.officer_files enable row level security;

drop policy if exists "of_read" on public.officer_files;
create policy "of_read" on public.officer_files for select to authenticated using ( public.is_officer() );

drop policy if exists "of_insert" on public.officer_files;
create policy "of_insert" on public.officer_files for insert to authenticated with check (
  author_id = auth.uid() and public.is_officer() );

drop policy if exists "of_delete" on public.officer_files;
create policy "of_delete" on public.officer_files for delete to authenticated using (
  author_id = auth.uid() or public.is_admin() );
