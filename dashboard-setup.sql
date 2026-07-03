-- ============================================================
--  삼기연 — 홈 대시보드 : 공지사항 + 수요조찬기도회
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 먼저 setup-all.sql 이 실행되어 있어야 합니다. 재실행해도 안전합니다.
--  ▶ 읽기: 누구나(비회원 포함) / 쓰기·삭제: 관리자(최고관리자 또는 회장)
-- ============================================================

-- 1) 공지사항
create table if not exists public.announcements (
  id          uuid default gen_random_uuid() primary key,
  title       text not null,
  body        text,
  pinned      boolean default false,      -- 상단 고정
  created_by  uuid references auth.users(id) on delete set null,
  author_name text,
  created_at  timestamptz default now()
);
alter table public.announcements enable row level security;

drop policy if exists "an_read" on public.announcements;
create policy "an_read" on public.announcements for select to anon, authenticated using ( true );
-- 공지사항 등록·수정·삭제: 임원(officer_role 보유자·회장·최고관리자) — is_officer() 는 officer-room-setup.sql 에 정의됨
drop policy if exists "an_insert" on public.announcements;
create policy "an_insert" on public.announcements for insert to authenticated with check ( public.is_officer() );
drop policy if exists "an_update" on public.announcements;
create policy "an_update" on public.announcements for update to authenticated using ( public.is_officer() ) with check ( public.is_officer() );
drop policy if exists "an_delete" on public.announcements;
create policy "an_delete" on public.announcements for delete to authenticated using ( public.is_officer() );

-- 2) 수요조찬기도회 (매월 첫 주 수요일 오전 7시 — 회원교회 순회)
create table if not exists public.prayer_meetings (
  id          uuid default gen_random_uuid() primary key,
  meet_date   date not null,             -- 모임 날짜
  host_church text,                       -- 섬기는(순회) 교회
  topic       text,                       -- 기도 제목 / 말씀
  note        text,                       -- 안내 문구
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);
alter table public.prayer_meetings enable row level security;

drop policy if exists "pm_read" on public.prayer_meetings;
create policy "pm_read" on public.prayer_meetings for select to anon, authenticated using ( true );
drop policy if exists "pm_insert" on public.prayer_meetings;
create policy "pm_insert" on public.prayer_meetings for insert to authenticated with check ( public.is_admin() );
drop policy if exists "pm_update" on public.prayer_meetings;
create policy "pm_update" on public.prayer_meetings for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
drop policy if exists "pm_delete" on public.prayer_meetings;
create policy "pm_delete" on public.prayer_meetings for delete to authenticated using ( public.is_admin() );

-- 조회 정렬용 인덱스
create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists prayer_meetings_date_idx on public.prayer_meetings (meet_date desc);
