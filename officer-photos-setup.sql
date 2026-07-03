-- ============================================================
--  삼기연 — 임원 사진 (임원 본인 또는 관리자만 변경)
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ officer_name 은 공백·'목사'를 뺀 이름(예: '장명희'). 로그인 회원의 profiles.name 과 매칭.
--  ▶ 읽기: 누구나 / 변경: 이름이 일치하는 본인 또는 관리자(최고관리자·회장)
--  ▶ 사진 파일은 Cloudflare R2(Worker /upload)에 저장. 재실행해도 안전합니다.
-- ============================================================

create table if not exists public.officer_photos (
  id           uuid default gen_random_uuid() primary key,
  officer_name text unique not null,     -- 정규화된 이름(공백·목사 제거)
  url          text,
  path         text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz default now()
);
alter table public.officer_photos enable row level security;

drop policy if exists "ofp_read" on public.officer_photos;
create policy "ofp_read" on public.officer_photos for select to anon, authenticated using ( true );

-- 본인(이름 일치) 또는 관리자만 등록
drop policy if exists "ofp_insert" on public.officer_photos;
create policy "ofp_insert" on public.officer_photos for insert to authenticated with check (
  public.is_admin()
  or exists (select 1 from public.profiles p where p.id = auth.uid()
             and regexp_replace(coalesce(p.name,''), '(\s|목사)', '', 'g') = officer_name)
);

-- 본인(이름 일치) 또는 관리자만 수정
drop policy if exists "ofp_update" on public.officer_photos;
create policy "ofp_update" on public.officer_photos for update to authenticated using (
  public.is_admin()
  or exists (select 1 from public.profiles p where p.id = auth.uid()
             and regexp_replace(coalesce(p.name,''), '(\s|목사)', '', 'g') = officer_name)
) with check (
  public.is_admin()
  or exists (select 1 from public.profiles p where p.id = auth.uid()
             and regexp_replace(coalesce(p.name,''), '(\s|목사)', '', 'g') = officer_name)
);

drop policy if exists "ofp_delete" on public.officer_photos;
create policy "ofp_delete" on public.officer_photos for delete to authenticated using ( public.is_admin() );
