-- ============================================================
--  삼기연 — 언론(Press) 기사
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 먼저 officer-room-setup.sql(is_officer), admin-president.sql(is_admin) 이 실행돼 있어야 합니다.
--  ▶ 읽기: 누구나(비회원 포함) / 등록: 임원 / 수정·삭제: 등록한 사람 또는 관리자
--  ▶ 재실행해도 안전합니다.
-- ============================================================

create table if not exists public.press_articles (
  id          uuid default gen_random_uuid() primary key,
  url         text not null,            -- 기사 원문 링크
  title       text,                     -- 제목
  source      text,                     -- 언론사
  published   text,                     -- 보도 날짜(표시용 문자열, 예: 2026.03.01)
  summary     text,                     -- 요약
  image_url   text,                     -- 대표 이미지 URL(선택)
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);
alter table public.press_articles enable row level security;

drop policy if exists "pr_read" on public.press_articles;
create policy "pr_read" on public.press_articles for select to anon, authenticated using ( true );

drop policy if exists "pr_insert" on public.press_articles;
create policy "pr_insert" on public.press_articles for insert to authenticated with check ( public.is_officer() );

drop policy if exists "pr_update" on public.press_articles;
create policy "pr_update" on public.press_articles for update to authenticated
  using ( created_by = auth.uid() or public.is_admin() )
  with check ( created_by = auth.uid() or public.is_admin() );

drop policy if exists "pr_delete" on public.press_articles;
create policy "pr_delete" on public.press_articles for delete to authenticated
  using ( created_by = auth.uid() or public.is_admin() );

create index if not exists press_articles_created_idx on public.press_articles (created_at desc);
