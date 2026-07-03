-- ============================================================
--  삼기연 — 역사 자료 아카이브 '삭제(숨김)' 기능
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 아카이브 문서는 사이트에 포함된 파일이라, 최고관리자가 '삭제'하면
--    이 표에 기록되어 목록에서 숨겨집니다. (되돌리기 가능)
--  ▶ 삭제는 최고관리자(kds08200820@gmail.com)만 할 수 있습니다.
--  ▶ 먼저 setup-all.sql(또는 officer-room-setup.sql)이 실행되어 있어야 합니다.
-- ============================================================

create table if not exists public.archive_hidden (
  path       text primary key,
  hidden_by  uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.archive_hidden enable row level security;

-- 읽기: 임원 (아카이브가 임원 전용이므로)
drop policy if exists "ah_read" on public.archive_hidden;
create policy "ah_read" on public.archive_hidden for select to authenticated using ( public.is_officer() );

-- 추가(삭제 처리): 최고관리자만
drop policy if exists "ah_insert" on public.archive_hidden;
create policy "ah_insert" on public.archive_hidden for insert to authenticated
  with check ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );

-- 제거(복구): 최고관리자만
drop policy if exists "ah_delete" on public.archive_hidden;
create policy "ah_delete" on public.archive_hidden for delete to authenticated
  using ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );
