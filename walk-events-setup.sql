-- ============================================================
--  삼기연 — 3·1 만세길 걷기 회차(행사) 관리 · 해마다 이어서 신청 받기
--  (walk-admin.html 행사 관리 · walk.html 신청 · 두 홈페이지 첫 화면 게시)
--  ▶ Supabase 대시보드(삼기연 프로젝트) → SQL Editor → 아래 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ▶ walk-setup.sql 을 이미 실행한 뒤에 실행합니다. (이 파일이 신청 · 고치기 · 삭제 함수를 회차별로 바꿉니다)
--  권한
--   · 회차 정보(날짜 · 장소 · 참가비 · 계좌 · 게시 여부): 누구나 봄 — 신청 페이지 · 첫 화면 안내용 (개인정보 없음)
--   · 회차 만들기 · 고치기 · 첫 화면 게시 · 신청 받기 켜고 끄기: 임원 · 최고관리자
--   · 회차 지우기: 서기 · 대표회장(회장) · 최고관리자, 신청이 한 건도 없을 때만
--   · 신청은 '신청 받기'가 켜져 있고 신청 마감일까지만 (한국 시각, 마감일 당일 밤 12시 전까지)
-- ============================================================

-- 1) 회차 표 ---------------------------------------------------
create table if not exists public.walk_events (
  event         text primary key,                 -- 회차 코드 (예: 2027-7) — 신청 기록이 이 코드로 묶임, 만든 뒤에는 바꾸지 않음
  no            int  not null unique check (no between 1 and 999),   -- 제 몇 회
  title         text not null check (char_length(btrim(title)) between 1 and 80),
  event_date    date,                             -- 행사 날짜
  time_text     text,                             -- 예: 오후 2시 ~ 5시
  place         text,
  fee           int  not null default 5000 check (fee between 0 and 1000000),   -- 성인 1인 참가비 (미성년 무료)
  bank          text default '농협',
  account       text default '355-0074-8148-33',
  holder        text default '삼괴연합회',
  apply_until   date,                             -- 신청 마감일 (이 날까지 받음)
  host          text default '주최 삼일만세운동본부 · 주관 삼괴지역기독교연합회',
  sponsor       text,
  contact       text default '김낭주 목사 010-4271-5090',
  intro         text,                             -- 첫 화면 소개 한두 줄 (선택)
  hero          boolean not null default false,   -- 두 홈페이지(삼기연 · 삼일만세운동본부) 첫 화면에 게시
  open          boolean not null default false,   -- 참가 신청 받기
  manse_sent_at timestamptz,                      -- 삼일만세운동본부로 이관한 시각
  manse_sent_by text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);
alter table public.walk_events enable row level security;
grant select on public.walk_events to anon, authenticated;
grant insert, update, delete on public.walk_events to authenticated;

drop policy if exists "we_read" on public.walk_events;
create policy "we_read" on public.walk_events for select to anon, authenticated using ( true );
drop policy if exists "we_insert" on public.walk_events;
create policy "we_insert" on public.walk_events for insert to authenticated with check ( public.is_officer() );
drop policy if exists "we_update" on public.walk_events;
create policy "we_update" on public.walk_events for update to authenticated
  using ( public.is_officer() ) with check ( public.is_officer() );
drop policy if exists "we_delete" on public.walk_events;
create policy "we_delete" on public.walk_events for delete to authenticated
  using ( public.is_walk_archiver()
          and not exists (select 1 from public.walk_applications w where w.event = walk_events.event) );

-- 첫 화면에는 한 회차만 — 한 회차를 게시하면 다른 회차의 게시는 자동으로 내려감
create or replace function public.walk_events_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.hero then
    update public.walk_events set hero = false where hero and event <> new.event;
  end if;
  return new;
end $$;
drop trigger if exists trg_walk_events_touch on public.walk_events;
create trigger trg_walk_events_touch before insert or update on public.walk_events
  for each row when (pg_trigger_depth() = 0) execute function public.walk_events_touch();

-- 처음 회차 넣기 (이미 있으면 그대로 둠)
--   제6회: 지난 행사 (2026-10-18) · 제7회: 준비 중 — 날짜 · 장소가 정해지면 임원방에서 채우고 게시 · 신청 받기를 켭니다
insert into public.walk_events (event, no, title, event_date, time_text, place, fee, apply_until, sponsor, hero, open)
values ('2026-6', 6, '제6회 3·1 만세길 걷기', '2026-10-18', '오후 2시 ~ 5시', '쌍봉산 근린공원', 5000, '2026-10-18',
        'CTS 기독교TV · 광복회 화성시지회', false, false),
       ('2027-7', 7, '제7회 3·1 만세길 걷기', null, null, null, 5000, null, null, false, false)
on conflict (event) do nothing;

-- 2) 지금 신청을 받는 회차인지 — 누구나 ----------------------------
create or replace function public.walk_is_open(p_event text)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((
    select e.open and (e.apply_until is null
                       or now() < ((e.apply_until + 1)::timestamp at time zone 'Asia/Seoul'))
    from public.walk_events e where e.event = p_event), false);
$$;
revoke all on function public.walk_is_open(text) from public;
grant execute on function public.walk_is_open(text) to anon, authenticated;

-- 3) 신청 — 신청 받는 회차에만 (walk-setup.sql 의 날짜 고정 검사를 회차별 검사로 바꿈) ------
create or replace function public.walk_apply(
  p_name text, p_church text, p_adults int, p_minors int, p_pin text, p_event text default '2026-6')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not public.walk_is_open(p_event) then
    raise exception '지금은 참가 신청을 받지 않습니다. (신청 기간이 아니거나 마감되었습니다)';
  end if;
  perform public.walk_check(p_name, p_church, p_adults, p_minors);
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception '신청 비밀번호를 숫자 4자리로 적어 주세요.';
  end if;
  insert into public.walk_applications (event, name, church, adults, minors, user_id, pin_hash)
  values (p_event, btrim(p_name), btrim(p_church), p_adults, p_minors, auth.uid(), crypt(p_pin, gen_salt('bf')))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.walk_apply(text, text, int, int, text, text) from public;
grant execute on function public.walk_apply(text, text, int, int, text, text) to anon, authenticated;

-- 4) 내 신청 고치기 · 삭제 — 그 회차가 신청을 받는 동안만 -----------------
create or replace function public.walk_update_mine(
  p_id uuid, p_name text, p_church text, p_pin text,
  p_new_name text, p_new_church text, p_adults int, p_minors int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare w public.walk_applications;
begin
  select * into w from public.walk_applications a where a.id = p_id for update;
  if not found or not public.walk_is_mine(w, p_name, p_church, p_pin) then
    raise exception '신청을 찾지 못했습니다. 이름 · 교회 · 신청 비밀번호를 다시 확인해 주세요.';
  end if;
  if not public.walk_is_open(w.event) then
    raise exception '참가 신청 기간이 끝나 고칠 수 없습니다.';
  end if;
  perform public.walk_check(p_new_name, p_new_church, p_adults, p_minors);
  if w.paid and p_adults <> w.adults then
    raise exception '입금이 확인된 신청은 성인 인원을 바꿀 수 없습니다. 행사 문의로 연락해 주세요.';
  end if;
  update public.walk_applications
     set name = btrim(p_new_name), church = btrim(p_new_church), adults = p_adults, minors = p_minors
   where id = w.id;
end $$;
revoke all on function public.walk_update_mine(uuid, text, text, text, text, text, int, int) from public;
grant execute on function public.walk_update_mine(uuid, text, text, text, text, text, int, int) to anon, authenticated;

create or replace function public.walk_delete_mine(p_id uuid, p_name text, p_church text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare w public.walk_applications;
begin
  select * into w from public.walk_applications a where a.id = p_id for update;
  if not found or not public.walk_is_mine(w, p_name, p_church, p_pin) then
    raise exception '신청을 찾지 못했습니다. 이름 · 교회 · 신청 비밀번호를 다시 확인해 주세요.';
  end if;
  if not public.walk_is_open(w.event) then
    raise exception '참가 신청 기간이 끝나 삭제할 수 없습니다. 행사 문의로 연락해 주세요.';
  end if;
  if w.paid and w.adults > 0 then
    raise exception '입금이 확인된 신청은 삭제할 수 없습니다. 환불 등은 행사 문의로 연락해 주세요.';
  end if;
  delete from public.walk_applications where id = w.id;
end $$;
revoke all on function public.walk_delete_mine(uuid, text, text, text) from public;
grant execute on function public.walk_delete_mine(uuid, text, text, text) to anon, authenticated;

-- 5) 홈페이지가 새 표 · 함수를 바로 알아보도록 + 실행 확인
--    성공하면 결과 창에 회차 목록이 나옵니다 (제6회 · 제7회 준비 중)
notify pgrst, 'reload schema';
select e.no as "회차", e.title as "행사", e.event_date as "날짜", e.hero as "첫 화면", e.open as "신청 받기",
       (select count(*) from public.walk_applications w where w.event = e.event) as "신청 건수"
from public.walk_events e order by e.no;
