-- ============================================================
--  삼기연 — 역사 자료 아카이브 '자료 추가'(업로드·자동변환) 저장소
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 관리자가 .docx/.hwpx 를 올리면 HTML로 변환되어 이 표에 저장되고,
--    아카이브 목록에 기존 자료와 같은 형식으로 함께 나타납니다.
--  ▶ 먼저 setup-all.sql 이 실행되어 있어야 합니다. 재실행해도 안전합니다.
-- ============================================================

create table if not exists public.archive_docs (
  id          uuid default gen_random_uuid() primary key,
  type        text,                 -- 총회자료/회의록/월례·임원회의/보고서/순서지
  title       text not null,        -- 목록에 보일 제목
  year        text,                 -- 연도(필터용)
  html        text,                 -- 변환된 문서 HTML(자체 완결형)
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);
alter table public.archive_docs enable row level security;

-- 읽기: 임원
drop policy if exists "ad_read" on public.archive_docs;
create policy "ad_read" on public.archive_docs for select to authenticated using ( public.is_officer() );

-- 추가/수정/삭제: 관리자(최고관리자 또는 회장)
drop policy if exists "ad_insert" on public.archive_docs;
create policy "ad_insert" on public.archive_docs for insert to authenticated with check ( public.is_admin() );
drop policy if exists "ad_update" on public.archive_docs;
create policy "ad_update" on public.archive_docs for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
drop policy if exists "ad_delete" on public.archive_docs;
create policy "ad_delete" on public.archive_docs for delete to authenticated using ( public.is_admin() );
