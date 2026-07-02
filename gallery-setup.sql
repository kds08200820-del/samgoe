-- ============================================================
--  삼기연 갤러리 게시판 — Supabase Storage + 테이블 설정
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 사진은 Supabase Storage(외부 저장소)에 저장되어 GitHub 용량과 무관합니다.
-- ============================================================

-- 1) 사진 저장용 버킷 (공개 읽기)
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

-- 2) 버킷 접근 권한 (storage.objects RLS)
--    읽기: 누구나 / 업로드: 정회원만 / 삭제: 본인 또는 관리자
drop policy if exists "gallery_read" on storage.objects;
create policy "gallery_read" on storage.objects
  for select using ( bucket_id = 'gallery' );

drop policy if exists "gallery_insert" on storage.objects;
create policy "gallery_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'gallery'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.member_type = '정회원')
  );

drop policy if exists "gallery_delete" on storage.objects;
create policy "gallery_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'gallery'
    and ( owner = auth.uid() or (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' )
  );

-- 3) 사진 정보 테이블 (업로더/설명/날짜)
create table if not exists public.gallery_photos (
  id            uuid default gen_random_uuid() primary key,
  path          text not null,
  url           text not null,
  caption       text,
  uploader_id   uuid references auth.users(id) on delete set null,
  uploader_name text,
  created_at    timestamptz default now()
);

alter table public.gallery_photos enable row level security;

-- 읽기: 누구나 (갤러리는 공개)
drop policy if exists "gp_read" on public.gallery_photos;
create policy "gp_read" on public.gallery_photos
  for select using ( true );

-- 등록: 정회원 본인만
drop policy if exists "gp_insert" on public.gallery_photos;
create policy "gp_insert" on public.gallery_photos
  for insert to authenticated with check (
    uploader_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.member_type = '정회원')
  );

-- 삭제: 본인 또는 관리자
drop policy if exists "gp_delete" on public.gallery_photos;
create policy "gp_delete" on public.gallery_photos
  for delete to authenticated using (
    uploader_id = auth.uid() or (auth.jwt() ->> 'email') = 'kds08200820@gmail.com'
  );
