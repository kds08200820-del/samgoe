-- ============================================================
--  삼일만세운동본부 — 활동 기록 · 사진 (홈페이지 '활동 기록'에서 임원이 추가하는 기록과 사진)
--  ▶ manse-setup.sql 실행 후 → 만세운동본부 Supabase 프로젝트 SQL Editor → 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ▶ 처음부터 있던 2021~2026 사진은 홈페이지 파일(manse/archive)에 있고, 임원방 '사진 저장소로 옮기기'로 옮길 수 있음
--  권한
--   · 보기: 누구나 (공개 홈페이지)
--   · 기록 · 사진 추가: 임원 (임원 명단 재직자)
--   · 고치기 · 지우기: 넣은 본인 · 그 기록을 만든 임원 · 대표회장 · 서기
-- ============================================================

-- 0) 맞는 프로젝트인지 확인 (manse-setup.sql 을 먼저)
do $$ begin
  if to_regprocedure('public.my_perms()') is null or to_regclass('public.walk_applications') is not null then
    raise exception '이 SQL은 삼일만세운동본부 Supabase 프로젝트에서, manse-setup.sql 을 먼저 실행한 뒤에 실행해야 합니다. (아무것도 바뀌지 않았습니다)';
  end if;
end $$;

-- 1) 활동 기록 ---------------------------------------------------
create table if not exists public.activities (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  cat          text check (cat is null or char_length(cat) <= 30),          -- 만세길 걷기 · 역사 탐방 · 문화 행사 · 단체 운영
  place        text check (place is null or char_length(place) <= 120),
  people       text check (people is null or char_length(people) <= 120),   -- 참가 인원 · 함께한 곳
  walk         int  check (walk is null or walk between 1 and 999),         -- 만세길 걷기 회차
  summary      text check (summary is null or char_length(summary) <= 3000),
  created_by   uuid references auth.users(id) on delete set null,
  creator_name text,
  created_at   timestamptz not null default now()
);
create index if not exists activities_date_idx on public.activities (date desc);
alter table public.activities enable row level security;
revoke all on public.activities from anon, authenticated;
grant select on public.activities to anon, authenticated;
grant insert, update, delete on public.activities to authenticated;
drop policy if exists "act_read" on public.activities;
create policy "act_read" on public.activities for select using ( true );
drop policy if exists "act_insert" on public.activities;
create policy "act_insert" on public.activities for insert to authenticated
  with check ( public.is_officer() and created_by = auth.uid() );
drop policy if exists "act_update" on public.activities;
create policy "act_update" on public.activities for update to authenticated
  using ( public.is_manager() or (public.is_officer() and created_by = auth.uid()) )
  with check ( public.is_manager() or (public.is_officer() and created_by = auth.uid()) );
drop policy if exists "act_delete" on public.activities;
create policy "act_delete" on public.activities for delete to authenticated
  using ( public.is_manager() or (public.is_officer() and created_by = auth.uid()) );

-- 그 활동 기록(event_key = 'a-<id>')을 만든 사람인지
create or replace function public.owns_activity(p_event_key text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.activities a where 'a-' || a.id::text = p_event_key and a.created_by = auth.uid());
$$;
revoke all on function public.owns_activity(text) from public, anon;
grant execute on function public.owns_activity(text) to authenticated;

-- 2) 활동 사진 ---------------------------------------------------
create table if not exists public.activity_photos (
  id            uuid primary key default gen_random_uuid(),
  event_key     text not null check (char_length(event_key) <= 80),   -- 처음 있던 행사 ID(예: e2024-walk) 또는 'a-<activities.id>'
  path          text not null unique check (char_length(path) <= 300),       -- 저장소 manse-photos 안의 큰 사진
  thumb_path    text not null check (char_length(thumb_path) <= 300),       -- 썸네일
  w             int,
  h             int,
  caption       text check (caption is null or char_length(caption) <= 300),
  sort          bigint not null default 0,
  uploaded_by   uuid references auth.users(id) on delete set null,
  uploader_name text,
  created_at    timestamptz not null default now()
);
create index if not exists activity_photos_event_idx on public.activity_photos (event_key, sort, created_at);
alter table public.activity_photos enable row level security;
revoke all on public.activity_photos from anon, authenticated;
grant select on public.activity_photos to anon, authenticated;
grant insert, update, delete on public.activity_photos to authenticated;
drop policy if exists "ph_read" on public.activity_photos;
create policy "ph_read" on public.activity_photos for select using ( true );
drop policy if exists "ph_insert" on public.activity_photos;
create policy "ph_insert" on public.activity_photos for insert to authenticated
  with check ( public.is_officer() and uploaded_by = auth.uid() );
drop policy if exists "ph_update" on public.activity_photos;
create policy "ph_update" on public.activity_photos for update to authenticated
  using ( public.is_manager() or uploaded_by = auth.uid() ) with check ( public.is_manager() or uploaded_by = auth.uid() );
drop policy if exists "ph_delete" on public.activity_photos;
create policy "ph_delete" on public.activity_photos for delete to authenticated
  using ( public.is_manager() or uploaded_by = auth.uid() or public.owns_activity(event_key) );

-- 3) 사진 저장소 (공개 · 사진 한 장 10MB) ---------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manse-photos', 'manse-photos', true, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "mphotos_read" on storage.objects;
create policy "mphotos_read" on storage.objects for select to authenticated
  using ( bucket_id = 'manse-photos' and public.is_officer() );
drop policy if exists "mphotos_insert" on storage.objects;
create policy "mphotos_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'manse-photos' and public.is_officer() );
drop policy if exists "mphotos_delete" on storage.objects;
create policy "mphotos_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'manse-photos' and public.is_officer()
          and (public.is_manager() or owner_id = auth.uid()::text or public.owns_activity(split_part(name, '/', 1))) );

-- 4) 탈퇴한 회원이 넣은 기록 · 사진의 이름을 익명으로 ------------------------
create or replace function public.anonymize_uploads()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    update public.activity_photos set uploader_name = '탈퇴한 회원' where uploaded_by = new.id;
    update public.activities set creator_name = '탈퇴한 회원' where created_by = new.id;
  end if;
  return new;
end $$;
revoke all on function public.anonymize_uploads() from public, anon, authenticated;
drop trigger if exists trg_anonymize_uploads on public.profiles;
create trigger trg_anonymize_uploads after update of withdrawn_at on public.profiles
  for each row execute function public.anonymize_uploads();

-- 5) 실행 확인
notify pgrst, 'reload schema';
select (select count(*) from public.activities) as "활동 기록", (select count(*) from public.activity_photos) as "사진";
