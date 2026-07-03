-- ============================================================
--  삼기연 — 히어로(첫 화면) 배경 사진
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 먼저 admin-president.sql(is_admin) 이 실행돼 있어야 합니다.
--  ▶ 읽기: 누구나 / 등록·수정·삭제: 관리자(최고관리자 또는 회장)
--  ▶ 사진 파일은 Cloudflare R2(Worker /upload)에 저장, 최대 5장 권장.
--  ▶ 재실행해도 안전합니다.
-- ============================================================

create table if not exists public.hero_images (
  id          uuid default gen_random_uuid() primary key,
  url         text not null,            -- 표시 URL(/i/<key>)
  path        text,                     -- 삭제용 키('r2:<key>')
  sort        int  default 0,           -- 표시 순서
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);
alter table public.hero_images enable row level security;

drop policy if exists "hi_read" on public.hero_images;
create policy "hi_read" on public.hero_images for select to anon, authenticated using ( true );

drop policy if exists "hi_insert" on public.hero_images;
create policy "hi_insert" on public.hero_images for insert to authenticated with check ( public.is_admin() );

drop policy if exists "hi_update" on public.hero_images;
create policy "hi_update" on public.hero_images for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "hi_delete" on public.hero_images;
create policy "hi_delete" on public.hero_images for delete to authenticated using ( public.is_admin() );

create index if not exists hero_images_sort_idx on public.hero_images (sort asc);
