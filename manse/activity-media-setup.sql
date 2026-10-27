-- ============================================================
--  삼일만세운동본부 — 활동 기록에 유튜브 영상 걸기 (manse-setup.sql · manse-photos-setup.sql 실행 후 1회 실행)
--  ▶ 만세운동본부 Supabase 프로젝트 → SQL Editor에 전체 붙여넣고 Run. 여러 번 실행해도 안전합니다.
--  ▶ 영상 파일은 올리지 않고 유튜브 영상 ID(11자)만 저장합니다 → 저장소·전송량을 쓰지 않음.
--  ▶ 누구나 보기 · 임원(임원 명단 재직자)만 추가 · 넣은 본인 또는 대표회장·서기만 수정/삭제 (그 활동 기록을 만든 임원도 삭제 가능)
--  사진은 이미 있는 activity_photos 표 + manse-photos 저장소를 그대로 씁니다(manse-photos-setup.sql).
-- ============================================================

-- 0) 맞는 프로젝트인지 확인 (manse-setup.sql · manse-photos-setup.sql 을 먼저)
do $$ begin
  if to_regprocedure('public.owns_activity(text)') is null or to_regclass('public.walk_applications') is not null then
    raise exception '이 SQL은 삼일만세운동본부 Supabase 프로젝트에서, manse-setup.sql · manse-photos-setup.sql 을 먼저 실행한 뒤에 실행해야 합니다. (아무것도 바뀌지 않았습니다)';
  end if;
end $$;

create table if not exists public.activity_videos (
  id          uuid default gen_random_uuid() primary key,
  event_key   text not null,                       -- 기존 행사 ID(예: e2024-walk) 또는 'a-<activities.id>'
  yt_id       text not null check (yt_id ~ '^[A-Za-z0-9_-]{11}$'),   -- 유튜브 영상 ID
  title       text,
  sort        int default 0,
  added_by    uuid references auth.users (id) on delete set null,
  adder_name  text,
  created_at  timestamptz not null default now(),
  unique (event_key, yt_id)                        -- 같은 활동에 같은 영상 두 번 X
);
alter table public.activity_videos enable row level security;
create index if not exists activity_videos_event_idx on public.activity_videos (event_key, sort, created_at);

revoke all on public.activity_videos from anon, authenticated;
grant select on public.activity_videos to anon, authenticated;
grant insert, update, delete on public.activity_videos to authenticated;

drop policy if exists "vid_read" on public.activity_videos;
create policy "vid_read" on public.activity_videos for select using ( true );
drop policy if exists "vid_insert" on public.activity_videos;
create policy "vid_insert" on public.activity_videos for insert to authenticated
  with check ( public.is_officer() and added_by = auth.uid() );
drop policy if exists "vid_update" on public.activity_videos;
create policy "vid_update" on public.activity_videos for update to authenticated
  using ( public.is_manager() or added_by = auth.uid() ) with check ( public.is_manager() or added_by = auth.uid() );
drop policy if exists "vid_delete" on public.activity_videos;
create policy "vid_delete" on public.activity_videos for delete to authenticated
  using ( public.is_manager() or added_by = auth.uid() or public.owns_activity(event_key) );

-- 탈퇴 시 넣은 사람 이름 익명화 (사진의 anonymize_uploads 와 같은 방식, 영상 표용 별도 트리거)
create or replace function public.anonymize_video_uploads()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    update public.activity_videos set adder_name = '탈퇴한 회원' where added_by = new.id;
  end if;
  return new;
end $$;
revoke all on function public.anonymize_video_uploads() from public, anon, authenticated;
drop trigger if exists trg_anonymize_video_uploads on public.profiles;
create trigger trg_anonymize_video_uploads after update of withdrawn_at on public.profiles
  for each row execute function public.anonymize_video_uploads();

notify pgrst, 'reload schema';

-- 확인 — 표·보안 규칙이 제대로 만들어졌는지 (rls_on = true, 규칙 4개)
select
  (select relrowsecurity from pg_class where oid = 'public.activity_videos'::regclass) as rls_on,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'activity_videos') as policies,
  (select string_agg(policyname || ':' || cmd, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'activity_videos') as policy_list,
  (select count(*) from public.activity_videos) as videos,
  (select count(*) from public.activity_photos) as photos;
