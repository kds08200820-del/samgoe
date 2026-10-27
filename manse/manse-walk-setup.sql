-- ============================================================
--  삼일만세운동본부 — 3·1 만세길 걷기 참가 교회 (회차별 교회 · 인원)
--  ▶ manse-setup.sql 실행 후 → 만세운동본부 Supabase 프로젝트 SQL Editor → 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ▶ 참가 신청은 삼기연 홈페이지에서 받고, 행사가 끝나면 삼기연 임원방 → 행사 신청 기록 →
--    '삼일만세운동본부로 이관'을 누르면 교회별 인원만 여기로 들어옴 (신청자 개인 이름은 오지 않음)
--  권한
--   · 보기: 임원 (임원방 → 걷기대회 탭)
--   · 넣기: 임원으로 로그인한 상태에서 walk_import 함수로만 (같은 회차를 다시 넣으면 새 내용으로 바뀜)
-- ============================================================

-- 0) 맞는 프로젝트인지 확인 (manse-setup.sql 을 먼저)
do $$ begin
  if to_regprocedure('public.my_perms()') is null or to_regclass('public.walk_applications') is not null then
    raise exception '이 SQL은 삼일만세운동본부 Supabase 프로젝트에서, manse-setup.sql 을 먼저 실행한 뒤에 실행해야 합니다. (아무것도 바뀌지 않았습니다)';
  end if;
end $$;

-- 1) 회차 · 교회별 인원 ---------------------------------------------
create table if not exists public.walk_runs (
  walk_no      int primary key check (walk_no between 1 and 999),   -- 제 몇 회
  event_key    text,                                                -- 삼기연 회차 코드 (예: 2026-6)
  title        text,
  event_date   date,
  place        text,
  churches     int not null default 0,
  apps         int not null default 0,                              -- 신청 건수
  adults       int not null default 0,
  minors       int not null default 0,
  sent_at      timestamptz not null default now(),                  -- 이관한 시각
  sent_by      uuid references auth.users(id) on delete set null,
  sent_by_name text
);
create table if not exists public.walk_churches (
  walk_no int  not null references public.walk_runs(walk_no) on delete cascade,
  church  text not null check (char_length(church) between 1 and 80),
  region  text,
  apps    int  not null default 0,
  adults  int  not null default 0,
  minors  int  not null default 0,
  primary key (walk_no, church)
);
alter table public.walk_runs enable row level security;
alter table public.walk_churches enable row level security;
revoke all on public.walk_runs, public.walk_churches from anon, authenticated;
grant select on public.walk_runs, public.walk_churches to authenticated;
drop policy if exists "wr_read" on public.walk_runs;
create policy "wr_read" on public.walk_runs for select to authenticated using ( public.is_officer() );
drop policy if exists "wc_read" on public.walk_churches;
create policy "wc_read" on public.walk_churches for select to authenticated using ( public.is_officer() );

-- 2) 이관 — p_rows: [{church, region, apps, adults, minors}, …] → 넣은 교회 수 ------------------
create or replace function public.walk_import(p_walk_no int, p_event_key text, p_title text, p_date date,
                                              p_place text, p_rows jsonb, p_by_name text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_officer() then
    raise exception '삼일만세운동본부 임원만 이관할 수 있습니다. (임원 명단에 가입 이메일이 있어야 합니다)';
  end if;
  if p_walk_no is null or p_walk_no not between 1 and 999 then raise exception '회차 번호를 확인해 주세요.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception '이관할 교회 목록이 없습니다.'; end if;

  insert into public.walk_runs (walk_no, event_key, title, event_date, place, sent_at, sent_by, sent_by_name)
  values (p_walk_no, left(p_event_key, 40), left(p_title, 120), p_date, left(p_place, 120), now(), auth.uid(), left(p_by_name, 60))
  on conflict (walk_no) do update
    set event_key = excluded.event_key, title = excluded.title, event_date = excluded.event_date, place = excluded.place,
        sent_at = excluded.sent_at, sent_by = excluded.sent_by, sent_by_name = excluded.sent_by_name;

  delete from public.walk_churches where walk_no = p_walk_no;   -- 다시 이관하면 새 내용으로
  insert into public.walk_churches (walk_no, church, region, apps, adults, minors)
  select p_walk_no, c, max(r), sum(a), sum(ad), sum(mi)
  from (
    select left(btrim(x ->> 'church'), 80) as c,
           nullif(left(btrim(coalesce(x ->> 'region', '')), 40), '') as r,
           case when x ->> 'apps'   ~ '^[0-9]{1,6}$' then (x ->> 'apps')::int   else 0 end as a,
           case when x ->> 'adults' ~ '^[0-9]{1,6}$' then (x ->> 'adults')::int else 0 end as ad,
           case when x ->> 'minors' ~ '^[0-9]{1,6}$' then (x ->> 'minors')::int else 0 end as mi
    from jsonb_array_elements(p_rows) x
    where jsonb_typeof(x) = 'object' and coalesce(btrim(x ->> 'church'), '') <> ''
  ) s
  group by c;

  update public.walk_runs w
     set churches = t.n, apps = t.a, adults = t.ad, minors = t.mi
    from (select count(*)::int n, coalesce(sum(apps), 0)::int a, coalesce(sum(adults), 0)::int ad, coalesce(sum(minors), 0)::int mi
            from public.walk_churches where walk_no = p_walk_no) t
   where w.walk_no = p_walk_no
  returning t.n into v_n;
  return v_n;
end $$;
revoke all on function public.walk_import(int, text, text, date, text, jsonb, text) from public, anon;
grant execute on function public.walk_import(int, text, text, date, text, jsonb, text) to authenticated;

-- 3) 실행 확인
notify pgrst, 'reload schema';
select (select count(*) from public.walk_runs) as "이관된 회차", (select count(*) from public.walk_churches) as "교회 기록";
