-- ============================================================
--  삼기연 — 역사 자료 아카이브 '제목 수정' 기능
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 최고관리자가 문서 제목을 고치면 이 표에 저장되어 목록에 반영됩니다.
--  ▶ 먼저 setup-all.sql 이 실행되어 있어야 합니다. 재실행해도 안전합니다.
-- ============================================================

create table if not exists public.archive_titles (
  path       text primary key,
  title      text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);
alter table public.archive_titles enable row level security;

-- 읽기: 임원
drop policy if exists "at_read" on public.archive_titles;
create policy "at_read" on public.archive_titles for select to authenticated using ( public.is_officer() );

-- 수정(추가/변경): 최고관리자만
drop policy if exists "at_insert" on public.archive_titles;
create policy "at_insert" on public.archive_titles for insert to authenticated
  with check ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );
drop policy if exists "at_update" on public.archive_titles;
create policy "at_update" on public.archive_titles for update to authenticated
  using ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );

-- 초기화(자동 제목으로 되돌리기): 최고관리자만
drop policy if exists "at_delete" on public.archive_titles;
create policy "at_delete" on public.archive_titles for delete to authenticated
  using ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );
