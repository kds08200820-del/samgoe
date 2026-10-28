-- ============================================================
--  삼일만세운동본부 — 3·1 만세길 걷기 회차별 결과 보고 (홈페이지 공개용 요약)
--  ▶ manse-setup.sql 실행 후 → 만세운동본부 Supabase 프로젝트 SQL Editor → 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ▶ 관리자 메뉴 → 걷기대회 관리 → 회차별 결과 보고 → '홈페이지에 게시' 를 누르면 그 회차의 요약이 여기에 저장되고,
--    홈페이지 첫 화면에 '결과 보고' 띠가 나옴 (report.html 에서 봄)
--  ▶ 사람 이름은 저장하지 않음 — 당첨자 명단은 빼고, 단체 · 시민은 이름 없이 곳 수만 (교회 이름과 숫자만)
--  권한
--   · 보기: 게시한 회차는 누구나, 게시를 내린 회차는 임원만
--   · 게시 · 다시 게시 · 내리기: 임원
--   · 지우기: 대표회장 · 서기
-- ============================================================

-- 0) 맞는 프로젝트인지 확인 (manse-setup.sql 을 먼저)
do $$ begin
  if to_regprocedure('public.my_perms()') is null or to_regclass('public.officer_files') is not null then
    raise exception '이 SQL은 삼일만세운동본부 Supabase 프로젝트에서, manse-setup.sql 을 먼저 실행한 뒤에 실행해야 합니다. (아무것도 바뀌지 않았습니다)';
  end if;
end $$;

-- 1) 회차별 결과 보고 -------------------------------------------
create table if not exists public.walk_reports (
  walk_no      int primary key check (walk_no between 1 and 999),                    -- 제 N 회
  event_key    text not null check (char_length(event_key) between 1 and 40),        -- 삼괴연합회 walk_events.event (예: 2026-6)
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  event_date   date,
  place        text check (place is null or char_length(place) <= 200),
  data         jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 300000),   -- 숫자 · 교회별 표 (이름 없음)
  published    boolean not null default true,                                         -- false = 게시 내림 (임원만 보임)
  published_at timestamptz not null default now(),                                    -- 마지막으로 게시한 때
  updated_by   uuid references auth.users(id) on delete set null
);
create index if not exists walk_reports_pub_idx on public.walk_reports (published, walk_no desc);

create or replace function public.walk_reports_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and not (new.published and (not old.published or new.data is distinct from old.data)) then
    new.published_at := old.published_at;   -- 내리기만 했으면 게시 날짜는 그대로
  else
    new.published_at := now();
  end if;
  return new;
end $$;
create or replace trigger trg_walk_reports_touch before insert or update on public.walk_reports
  for each row execute function public.walk_reports_touch();

alter table public.walk_reports enable row level security;
revoke all on public.walk_reports from anon, authenticated;
grant select on public.walk_reports to anon, authenticated;
grant insert, update, delete on public.walk_reports to authenticated;
-- 정책: 없으면 만들고, 있으면 아래 내용으로 맞춤 (지우지 않고 다시 실행해도 안전)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walk_reports' and policyname = 'wr_read_public') then
    create policy "wr_read_public" on public.walk_reports for select to anon using ( published );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walk_reports' and policyname = 'wr_read') then
    create policy "wr_read" on public.walk_reports for select to authenticated using ( published or public.is_officer() );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walk_reports' and policyname = 'wr_insert') then
    create policy "wr_insert" on public.walk_reports for insert to authenticated with check ( public.is_officer() );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walk_reports' and policyname = 'wr_update') then
    create policy "wr_update" on public.walk_reports for update to authenticated using ( public.is_officer() ) with check ( public.is_officer() );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walk_reports' and policyname = 'wr_delete') then
    create policy "wr_delete" on public.walk_reports for delete to authenticated using ( public.is_manager() );
  end if;
end $$;
alter policy "wr_read_public" on public.walk_reports to anon using ( published );
alter policy "wr_read" on public.walk_reports to authenticated using ( published or public.is_officer() );
alter policy "wr_insert" on public.walk_reports to authenticated with check ( public.is_officer() );
alter policy "wr_update" on public.walk_reports to authenticated using ( public.is_officer() ) with check ( public.is_officer() );
alter policy "wr_delete" on public.walk_reports to authenticated using ( public.is_manager() );

select '결과 보고 게시 ' || count(*) || '회차 (처음엔 0)' as "설치 확인" from public.walk_reports;
