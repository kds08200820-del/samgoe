-- ============================================================
--  삼일만세운동본부 — 3·1 만세길 걷기 (회차 · 참가 신청 · 행운권 QR · 경품 당첨 · 인증 · 수령)
--  ▶ manse-setup.sql 실행 후 → 만세운동본부 Supabase 프로젝트 SQL Editor → 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ▶ 화면: walk.html(참가 신청 · 경품 당첨 인증) · walk-admin.html(회차 · 신청 기록) · lucky-admin.html(행운권 QR) · lucky.html(행운권 등록)
--          prize-winners.html(당첨자 명단 · 수령) · officer.html 걷기대회 관리(결과 보고)
--  권한 (만세운동본부 임원 = 임원 명단 재직자, 운영임원 = 대표회장 · 서기 · 최고관리자)
--   · 회차 정보 · 당첨 번호: 누구나 봄 (개인정보 없음)
--   · 참가 신청 · 행운권 등록 · 당첨 인증: 누구나 (로그인 없이) — 함수로만, 개인정보는 임원만 봄
--   · 회차 만들기 · 고치기 · 첫 화면 게시 · 신청 받기 · 행운권 만들기 · 등록 고치기 · 입금 확인 · 수령 확인 · 인증 삭제: 임원
--   · 회차 지우기(신청 없을 때) · 등록 정보 모두 지우기: 운영임원
-- ============================================================

-- 0) 맞는 프로젝트인지 확인 (manse-setup.sql 을 먼저)
do $$ begin
  if to_regprocedure('public.my_perms()') is null or to_regclass('public.officer_files') is not null or to_regclass('public.sermons') is not null then
    raise exception '이 SQL은 삼일만세운동본부 Supabase 프로젝트에서, manse-setup.sql 을 먼저 실행한 뒤에 실행해야 합니다. (아무것도 바뀌지 않았습니다)';
  end if;
end $$;
create extension if not exists pgcrypto with schema extensions;

-- 정책 도우미 — 없으면 만들고 있으면 내용을 맞춤 (지우지 않아 다시 실행해도 안전)
create or replace function pg_temp.pol(p_name text, p_table text, p_cmd text, p_roles text, p_using text, p_check text)
returns void language plpgsql as $$
declare v_u text := case when p_using is null then '' else ' using (' || p_using || ')' end;
        v_c text := case when p_check is null then '' else ' with check (' || p_check || ')' end;
begin
  if not exists (select 1 from pg_policies where schemaname = split_part(p_table, '.', 1) and tablename = split_part(p_table, '.', 2) and policyname = p_name) then
    execute format('create policy %I on %s for %s to %s%s%s', p_name, p_table, p_cmd, p_roles, v_u, v_c);
  else
    execute format('alter policy %I on %s to %s%s%s', p_name, p_table, p_roles, v_u, v_c);
  end if;
end $$;

-- ============================================================
-- 1) 회차 (행사) ---------------------------------------------
-- ============================================================
create table if not exists public.walk_events (
  event         text primary key,                 -- 회차 코드 (예: 2027-7) — 신청 · 행운권 · 경품 기록이 이 코드로 묶임
  no            int  not null unique check (no between 1 and 999),   -- 제 몇 회
  title         text not null check (char_length(btrim(title)) between 1 and 80),
  event_date    date,
  time_text     text,                             -- 예: 오후 2시 ~ 5시
  place         text,
  fee           int  not null default 5000 check (fee between 0 and 1000000),   -- 성인 1인 참가비 (미성년 무료)
  bank          text default '농협',
  account       text default '355-0074-8148-33',
  holder        text default '삼괴연합회',
  apply_until   date,                             -- 신청 마감일
  host          text default '주최 삼일만세운동본부 · 주관 삼괴지역기독교연합회',
  sponsor       text,
  contact       text default '김낭주 목사 010-4271-5090',
  intro         text,
  hero          boolean not null default false,   -- 두 홈페이지 첫 화면에 게시
  open          boolean not null default false,   -- 참가 신청 받기
  updated_at    timestamptz not null default now(),
  updated_by    text
);
create table if not exists public.walk_applications (
  id         uuid primary key default gen_random_uuid(),
  event      text not null references public.walk_events(event),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  church     text not null check (char_length(btrim(church)) between 1 and 60),
  adults     int  not null check (adults between 0 and 300),
  minors     int  not null check (minors between 0 and 300),
  paid       boolean not null default false,
  user_id    uuid default auth.uid() references auth.users(id) on delete set null,
  pin_hash   text,                                 -- 신청 비밀번호(암호화)
  pin_fails  int not null default 0,
  pin_locked_until timestamptz,
  constraint walk_people_check check (adults + minors > 0)
);
create index if not exists walk_applications_event_idx on public.walk_applications(event, created_at);
alter table public.walk_events enable row level security;
revoke all on public.walk_events from anon, authenticated;
grant select on public.walk_events to anon, authenticated;
grant insert, update, delete on public.walk_events to authenticated;
select pg_temp.pol('we_read',   'public.walk_events', 'select', 'anon, authenticated', 'true', null);
select pg_temp.pol('we_insert', 'public.walk_events', 'insert', 'authenticated', null, 'public.is_officer()');
select pg_temp.pol('we_update', 'public.walk_events', 'update', 'authenticated', 'public.is_officer()', 'public.is_officer()');
select pg_temp.pol('we_delete', 'public.walk_events', 'delete', 'authenticated',
  'public.is_manager() and not exists (select 1 from public.walk_applications w where w.event = walk_events.event)', null);

-- 첫 화면에는 한 회차만 — 한 회차를 게시하면 다른 회차의 게시는 자동으로 내려감
create or replace function public.walk_events_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.hero then update public.walk_events set hero = false where hero and event <> new.event; end if;
  return new;
end $$;
create or replace trigger trg_walk_events_touch before insert or update on public.walk_events
  for each row when (pg_trigger_depth() = 0) execute function public.walk_events_touch();

-- 2) 참가 신청 — 권한 · 함수 ---------------------------------
alter table public.walk_applications enable row level security;
revoke all on public.walk_applications from anon, authenticated;
grant select, update, delete on public.walk_applications to authenticated;   -- 넣기는 walk_apply 함수로만
select pg_temp.pol('walk_select', 'public.walk_applications', 'select', 'authenticated', 'public.is_officer() or user_id = auth.uid()', null);
select pg_temp.pol('walk_update', 'public.walk_applications', 'update', 'authenticated', 'public.is_officer()', 'public.is_officer()');
select pg_temp.pol('walk_delete', 'public.walk_applications', 'delete', 'authenticated', 'public.is_officer()', null);

-- 지금 신청을 받는 회차인지 — 누구나
create or replace function public.walk_is_open(p_event text)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select e.open and (e.apply_until is null or now() < ((e.apply_until + 1)::timestamp at time zone 'Asia/Seoul'))
                   from public.walk_events e where e.event = p_event), false);
$$;
revoke all on function public.walk_is_open(text) from public;
grant execute on function public.walk_is_open(text) to anon, authenticated;

create or replace function public.walk_norm(t text)
returns text language sql immutable as $$ select regexp_replace(coalesce(t, ''), '\s', '', 'g'); $$;

create or replace function public.walk_check(p_name text, p_church text, p_adults int, p_minors int)
returns void language plpgsql as $$
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then raise exception '신청자 이름을 적어 주세요.'; end if;
  if char_length(btrim(coalesce(p_church, ''))) not between 1 and 60 then raise exception '신청 교회를 적어 주세요.'; end if;
  if coalesce(p_adults, -1) not between 0 and 300 or coalesce(p_minors, -1) not between 0 and 300 then raise exception '인원을 다시 확인해 주세요.'; end if;
  if p_adults + p_minors <= 0 then raise exception '인원을 1명 이상 적어 주세요.'; end if;
end $$;

-- 신청 — 누구나, 신청 받는 회차에만, 신청 비밀번호(숫자 4자리) 필수
create or replace function public.walk_apply(p_name text, p_church text, p_adults int, p_minors int, p_pin text, p_event text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not public.walk_is_open(p_event) then raise exception '지금은 참가 신청을 받지 않습니다. (신청 기간이 아니거나 마감되었습니다)'; end if;
  perform public.walk_check(p_name, p_church, p_adults, p_minors);
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception '신청 비밀번호를 숫자 4자리로 적어 주세요.'; end if;
  insert into public.walk_applications (event, name, church, adults, minors, user_id, pin_hash)
  values (p_event, btrim(p_name), btrim(p_church), p_adults, p_minors, auth.uid(), crypt(p_pin, gen_salt('bf')))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.walk_apply(text, text, int, int, text, text) from public;
grant execute on function public.walk_apply(text, text, int, int, text, text) to anon, authenticated;

-- 교회별 합계 — 임원만 (그 밖에는 빈 결과)
create or replace function public.walk_summary(p_event text)
returns table (church text, apps bigint, adults bigint, minors bigint)
language sql security definer set search_path = public stable as $$
  select btrim(w.church), count(*), sum(w.adults), sum(w.minors) from public.walk_applications w
  where w.event = p_event and public.is_officer() group by btrim(w.church) order by sum(w.adults + w.minors) desc, btrim(w.church);
$$;
revoke all on function public.walk_summary(text) from public, anon;
grant execute on function public.walk_summary(text) to authenticated;

-- 내 신청 확인 (로그인 없이) — 이름 + 교회 + 신청 비밀번호. 5번 틀리면 10분 동안 조회 막힘
create or replace function public.walk_lookup(p_name text, p_church text, p_pin text, p_event text)
returns table (id uuid, created_at timestamptz, name text, church text, adults int, minors int, paid boolean)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare cand uuid[]; hit uuid[];
begin
  if public.walk_norm(p_name) = '' or public.walk_norm(p_church) = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then return; end if;
  select array_agg(w.id) into cand from public.walk_applications w
   where w.event = p_event and public.walk_norm(w.name) = public.walk_norm(p_name) and public.walk_norm(w.church) = public.walk_norm(p_church)
     and (w.pin_locked_until is null or w.pin_locked_until <= now());
  if cand is null then return; end if;
  select array_agg(w.id) into hit from public.walk_applications w where w.id = any(cand) and w.pin_hash is not null and crypt(p_pin, w.pin_hash) = w.pin_hash;
  if hit is null then
    update public.walk_applications w
       set pin_fails = case when w.pin_fails + 1 >= 5 then 0 else w.pin_fails + 1 end,
           pin_locked_until = case when w.pin_fails + 1 >= 5 then now() + interval '10 minutes' else w.pin_locked_until end
     where w.id = any(cand);
    return;
  end if;
  update public.walk_applications w set pin_fails = 0 where w.id = any(hit) and w.pin_fails <> 0;
  return query select w.id, w.created_at, w.name, w.church, w.adults, w.minors, w.paid from public.walk_applications w where w.id = any(hit) order by w.created_at desc;
end $$;
revoke all on function public.walk_lookup(text, text, text, text) from public;
grant execute on function public.walk_lookup(text, text, text, text) to anon, authenticated;

-- 우리 교회 신청 보기 (로그인) — 내 회원정보의 소속(교회)과 같은 신청만
create or replace function public.walk_my_church(p_event text)
returns table (id uuid, created_at timestamptz, name text, church text, adults int, minors int, paid boolean, mine boolean)
language sql security definer set search_path = public stable as $$
  select w.id, w.created_at, w.name, w.church, w.adults, w.minors, w.paid, coalesce(w.user_id = auth.uid(), false)
  from public.walk_applications w join public.profiles p on p.id = auth.uid()
  where w.event = p_event and public.walk_norm(p.church) <> '' and public.walk_norm(w.church) = public.walk_norm(p.church)
  order by w.created_at desc;
$$;
revoke all on function public.walk_my_church(text) from public, anon;
grant execute on function public.walk_my_church(text) to authenticated;

create or replace function public.walk_is_mine(w public.walk_applications, p_name text, p_church text, p_pin text)
returns boolean language sql stable set search_path = public, extensions as $$
  select coalesce((auth.uid() is not null and coalesce(w.user_id = auth.uid(), false))
    or (coalesce(p_pin, '') ~ '^[0-9]{4}$' and w.pin_hash is not null and (w.pin_locked_until is null or w.pin_locked_until <= now())
        and public.walk_norm(p_name) <> '' and public.walk_norm(p_church) <> ''
        and public.walk_norm(w.name) = public.walk_norm(p_name) and public.walk_norm(w.church) = public.walk_norm(p_church)
        and crypt(p_pin, w.pin_hash) = w.pin_hash), false);
$$;
revoke all on function public.walk_is_mine(public.walk_applications, text, text, text) from public, anon, authenticated;

create or replace function public.walk_update_mine(p_id uuid, p_name text, p_church text, p_pin text, p_new_name text, p_new_church text, p_adults int, p_minors int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare w public.walk_applications;
begin
  select * into w from public.walk_applications a where a.id = p_id for update;
  if not found or not public.walk_is_mine(w, p_name, p_church, p_pin) then raise exception '신청을 찾지 못했습니다. 이름 · 교회 · 신청 비밀번호를 다시 확인해 주세요.'; end if;
  if not public.walk_is_open(w.event) then raise exception '참가 신청 기간이 끝나 고칠 수 없습니다.'; end if;
  perform public.walk_check(p_new_name, p_new_church, p_adults, p_minors);
  if w.paid and p_adults <> w.adults then raise exception '입금이 확인된 신청은 성인 인원을 바꿀 수 없습니다. 행사 문의로 연락해 주세요.'; end if;
  update public.walk_applications set name = btrim(p_new_name), church = btrim(p_new_church), adults = p_adults, minors = p_minors where id = w.id;
end $$;
revoke all on function public.walk_update_mine(uuid, text, text, text, text, text, int, int) from public;
grant execute on function public.walk_update_mine(uuid, text, text, text, text, text, int, int) to anon, authenticated;

create or replace function public.walk_delete_mine(p_id uuid, p_name text, p_church text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare w public.walk_applications;
begin
  select * into w from public.walk_applications a where a.id = p_id for update;
  if not found or not public.walk_is_mine(w, p_name, p_church, p_pin) then raise exception '신청을 찾지 못했습니다. 이름 · 교회 · 신청 비밀번호를 다시 확인해 주세요.'; end if;
  if not public.walk_is_open(w.event) then raise exception '참가 신청 기간이 끝나 삭제할 수 없습니다. 행사 문의로 연락해 주세요.'; end if;
  if w.paid and w.adults > 0 then raise exception '입금이 확인된 신청은 삭제할 수 없습니다. 환불 등은 행사 문의로 연락해 주세요.'; end if;
  delete from public.walk_applications where id = w.id;
end $$;
revoke all on function public.walk_delete_mine(uuid, text, text, text) from public;
grant execute on function public.walk_delete_mine(uuid, text, text, text) to anon, authenticated;

-- 총 참가자 수 — 누구나 (신청 인원 합계 숫자 하나만)
create or replace function public.walk_total(p_event text)
returns int language sql security definer set search_path = public stable as $$
  select coalesce(sum(w.adults + w.minors), 0)::int from public.walk_applications w where w.event = p_event;
$$;
revoke all on function public.walk_total(text) from public;
grant execute on function public.walk_total(text) to anon, authenticated;

-- ============================================================
-- 3) 행운권 QR ---------------------------------------------
-- ============================================================
create table if not exists public.lucky_events (
  event      text primary key references public.walk_events(event) on delete cascade,
  title      text check (title is null or char_length(btrim(title)) between 1 and 80),   -- 행운권에 넣을 행사명 (비우면 회차 이름)
  subtitle   text check (subtitle is null or char_length(subtitle) <= 120),
  art_path   text check (art_path is null or char_length(art_path) <= 200),         -- 행운권 이미지 (저장소 lucky-art)
  open       boolean not null default true,                                         -- QR 등록 받기
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.lucky_events enable row level security;
revoke all on public.lucky_events from anon, authenticated;
grant select on public.lucky_events to anon, authenticated;
grant insert, update on public.lucky_events to authenticated;
select pg_temp.pol('le_read',   'public.lucky_events', 'select', 'anon, authenticated', 'true', null);
select pg_temp.pol('le_insert', 'public.lucky_events', 'insert', 'authenticated', null, 'public.is_officer()');
select pg_temp.pol('le_update', 'public.lucky_events', 'update', 'authenticated', 'public.is_officer()', 'public.is_officer()');
create or replace function public.lucky_events_touch()
returns trigger language plpgsql set search_path = public as $$ begin new.updated_at := now(); return new; end $$;
create or replace trigger trg_lucky_events_touch before update on public.lucky_events for each row execute function public.lucky_events_touch();

create table if not exists public.lucky_tickets (
  event         text not null references public.walk_events(event),
  no            int  not null check (no between 1 and 99999),
  code          text not null unique check (code ~ '^[A-Z2-9]{8}$'),   -- QR 안의 확인 코드
  created_at    timestamptz not null default now(),
  name          text check (name is null or char_length(btrim(name)) between 1 and 40),
  birth         date,
  church        text check (church is null or char_length(btrim(church)) between 1 and 60),   -- 소속 (교회 · 단체)
  phone         text,
  registered_at timestamptz,
  reg_user      uuid references auth.users(id) on delete set null,
  updated_by    text,
  primary key (event, no),
  constraint lucky_reg_all check ((name is null and birth is null and church is null and registered_at is null)
                               or (name is not null and birth is not null and church is not null and registered_at is not null)),
  constraint lucky_phone_check check (phone is null or (phone ~ '^01[016789][0-9]{7,8}$' and registered_at is not null))
);
create index if not exists lucky_tickets_reg_idx on public.lucky_tickets(event, registered_at);
alter table public.lucky_tickets enable row level security;
create or replace function public.lucky_pkey(p text)
returns text language sql immutable as $$ select lower(regexp_replace(coalesce(p, ''), '\s', '', 'g')); $$;
do $$ begin
  if not exists (select 1 from public.lucky_tickets where registered_at is not null group by event, public.lucky_pkey(name), birth having count(*) > 1) then
    create unique index if not exists lucky_person_uniq on public.lucky_tickets (event, public.lucky_pkey(name), birth) where registered_at is not null;
  end if;
end $$;
revoke all on public.lucky_tickets from anon, authenticated;
grant select, delete on public.lucky_tickets to authenticated;
grant update (name, birth, church, phone, registered_at, reg_user, updated_by) on public.lucky_tickets to authenticated;
select pg_temp.pol('lt_read',   'public.lucky_tickets', 'select', 'authenticated', 'public.is_officer()', null);
select pg_temp.pol('lt_update', 'public.lucky_tickets', 'update', 'authenticated', 'public.is_officer()', 'public.is_officer()');
select pg_temp.pol('lt_delete', 'public.lucky_tickets', 'delete', 'authenticated', 'public.is_officer() and registered_at is null', null);

create or replace function public.lucky_code()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(8); s text := ''; i int;
begin for i in 0..7 loop s := s || substr(a, (get_byte(b, i) % 31) + 1, 1); end loop; return s; end $$;
revoke all on function public.lucky_code() from public, anon, authenticated;
create or replace function public.lucky_norm(p text)
returns text language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')); $$;
create or replace function public.lucky_mask(p text)
returns text language sql immutable as $$
  select case when p is null then null when char_length(btrim(p)) <= 1 then '*' when char_length(btrim(p)) = 2 then left(btrim(p), 1) || '*'
              else left(btrim(p), 1) || repeat('*', char_length(btrim(p)) - 2) || right(btrim(p), 1) end; $$;

-- 행운권 만들기 — 임원. 아직 없는 번호만 새로 만들고 새로 만든 장 수를 돌려줌
create or replace function public.lucky_make(p_event text, p_from int, p_to int)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_new int := 0; v_n int; i int;
begin
  if not public.is_officer() then raise exception '임원만 행운권을 만들 수 있습니다.'; end if;
  if not exists (select 1 from public.walk_events e where e.event = p_event) then raise exception '회차를 찾지 못했습니다.'; end if;
  if p_from is null or p_to is null or p_from < 1 or p_to > 99999 or p_from > p_to then raise exception '번호 범위를 다시 확인해 주세요. (1 ~ 99999, 시작 번호 ≤ 끝 번호)'; end if;
  if p_to - p_from + 1 > 3000 then raise exception '한 번에 3000장까지 만들 수 있습니다. 범위를 나눠서 만들어 주세요.'; end if;
  for i in 1..5 loop
    insert into public.lucky_tickets (event, no, code)
    select p_event, n, public.lucky_code() from generate_series(p_from, p_to) n
    where not exists (select 1 from public.lucky_tickets t where t.event = p_event and t.no = n) on conflict do nothing;
    get diagnostics v_n = row_count; v_new := v_new + v_n;
    exit when not exists (select 1 from generate_series(p_from, p_to) n where not exists (select 1 from public.lucky_tickets t where t.event = p_event and t.no = n));
  end loop;
  insert into public.lucky_events (event) values (p_event) on conflict (event) do nothing;
  return v_new;
end $$;
revoke all on function public.lucky_make(text, int, int) from public, anon;
grant execute on function public.lucky_make(text, int, int) to authenticated;

-- 행운권 한 장 보기 — 누구나, 확인 코드를 알 때만 (이름은 가려서)
create or replace function public.lucky_info(p_code text)
returns table (event text, no int, title text, subtitle text, art_path text, open boolean, registered boolean, masked_name text, registered_at timestamptz,
               event_title text, event_date date, place text, contact text)
language sql security definer set search_path = public stable as $$
  select t.event, t.no, coalesce(le.title, e.title), le.subtitle, le.art_path, coalesce(le.open, true), t.registered_at is not null, public.lucky_mask(t.name), t.registered_at,
         e.title, e.event_date, e.place, e.contact
  from public.lucky_tickets t join public.walk_events e on e.event = t.event left join public.lucky_events le on le.event = t.event
  where t.code = public.lucky_norm(p_code);
$$;
revoke all on function public.lucky_info(text) from public;
grant execute on function public.lucky_info(text) to anon, authenticated;

-- 행운권 등록 — 누구나 (로그인 없이), 한 장에 한 번, 한 사람(이름 + 생년월일)은 한 회차에 한 장만
create or replace function public.lucky_register(p_code text, p_name text, p_birth date, p_church text, p_phone text default null)
returns table (event text, no int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare t public.lucky_tickets; v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  select * into t from public.lucky_tickets x where x.code = public.lucky_norm(p_code) for update;
  if not found then raise exception '행운권을 찾지 못했습니다. QR 코드를 다시 찍어 주세요.'; end if;
  if t.registered_at is not null then
    if t.name = btrim(coalesce(p_name, '')) and t.birth = p_birth and t.church = btrim(coalesce(p_church, '')) then return query select t.event, t.no; return; end if;
    raise exception '이미 등록된 행운권입니다.';
  end if;
  if not coalesce((select le.open from public.lucky_events le where le.event = t.event), true) then raise exception '지금은 행운권 등록을 받지 않습니다.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then raise exception '이름을 적어 주세요.'; end if;
  if p_birth is null or p_birth < date '1900-01-01' or p_birth > (now() at time zone 'Asia/Seoul')::date then raise exception '생년월일을 다시 확인해 주세요.'; end if;
  if char_length(btrim(coalesce(p_church, ''))) not between 1 and 60 then raise exception '소속을 적어 주세요. (교회 · 의용소방대 · 방범대 등) 소속이 없으면 ''없음''이라고 적어 주세요.'; end if;
  if v_phone is not null and v_phone !~ '^01[016789][0-9]{7,8}$' then raise exception '휴대폰 번호를 다시 확인해 주세요. (예: 010-1234-5678) 번호 없이 등록하려면 칸을 비워 주세요.'; end if;
  if exists (select 1 from public.lucky_tickets x where x.event = t.event and x.registered_at is not null and x.no <> t.no
             and public.lucky_pkey(x.name) = public.lucky_pkey(p_name) and x.birth = p_birth) then
    raise exception '% 님(% 생)은 이미 행운권을 등록하셨습니다. 한 분은 행운권 한 장만 등록할 수 있습니다.', btrim(p_name), to_char(p_birth, 'YYYY.MM.DD');
  end if;
  begin
    update public.lucky_tickets x set name = btrim(p_name), birth = p_birth, church = btrim(p_church), phone = v_phone, registered_at = now(), reg_user = auth.uid()
     where x.event = t.event and x.no = t.no;
  exception when unique_violation then
    raise exception '% 님(% 생)은 이미 행운권을 등록하셨습니다. 한 분은 행운권 한 장만 등록할 수 있습니다.', btrim(p_name), to_char(p_birth, 'YYYY.MM.DD');
  end;
  return query select t.event, t.no;
end $$;
revoke all on function public.lucky_register(text, text, date, text, text) from public;
grant execute on function public.lucky_register(text, text, date, text, text) to anon, authenticated;

-- 등록 정보 모두 지우기 — 운영임원 (경품 지급을 마친 뒤 개인정보 파기). 번호 · QR은 남김
create or replace function public.lucky_wipe(p_event text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_manager() then raise exception '대표회장 · 서기만 등록 정보를 모두 지울 수 있습니다.'; end if;
  insert into public.lucky_events (event, open) values (p_event, false) on conflict (event) do update set open = false;
  update public.lucky_tickets t set name = null, birth = null, church = null, phone = null, registered_at = null, reg_user = null, updated_by = null
   where t.event = p_event and t.registered_at is not null;
  get diagnostics v_n = row_count; return v_n;
end $$;
revoke all on function public.lucky_wipe(text) from public, anon;
grant execute on function public.lucky_wipe(text) to authenticated;

-- 행운권 이미지 저장소 (공개 · 개인정보 없음)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lucky-art', 'lucky-art', true, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
select pg_temp.pol('lucky_art_insert', 'storage.objects', 'insert', 'authenticated', null, 'bucket_id = ''lucky-art'' and public.is_officer()');
select pg_temp.pol('lucky_art_read',   'storage.objects', 'select', 'authenticated', 'bucket_id = ''lucky-art'' and public.is_officer()', null);
select pg_temp.pol('lucky_art_delete', 'storage.objects', 'delete', 'authenticated', 'bucket_id = ''lucky-art'' and public.is_officer()', null);

-- ============================================================
-- 4) 경품 당첨 · 인증 · 수령 -----------------------------------
-- ============================================================
create table if not exists public.prize_winners (
  event  text not null references public.walk_events(event),
  ticket int  not null check (ticket between 1 and 99999),
  prize  text not null,
  seq    int  not null,                          -- 추첨 순서
  primary key (event, ticket, prize)
);
alter table public.prize_winners enable row level security;
revoke all on public.prize_winners from anon, authenticated;
grant select on public.prize_winners to anon, authenticated;
grant insert, update, delete on public.prize_winners to authenticated;
select pg_temp.pol('pw_read',   'public.prize_winners', 'select', 'anon, authenticated', 'true', null);
select pg_temp.pol('pw_write',  'public.prize_winners', 'insert', 'authenticated', null, 'public.is_officer()');
select pg_temp.pol('pw_update', 'public.prize_winners', 'update', 'authenticated', 'public.is_officer()', 'public.is_officer()');
select pg_temp.pol('pw_delete', 'public.prize_winners', 'delete', 'authenticated', 'public.is_officer()', null);

create table if not exists public.prize_claims (
  id          uuid primary key default gen_random_uuid(),
  event       text not null references public.walk_events(event),
  created_at  timestamptz not null default now(),
  batch_id    uuid not null,                     -- 한꺼번에 올린 인증 묶음
  ticket      int  not null,
  prize       text not null,
  name        text not null check (char_length(name) between 1 and 40),
  church      text check (church is null or char_length(church) <= 60),
  photo_paths text[] not null,                   -- 저장소 prize-proofs 안 (회차/묶음/파일)
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  constraint prize_claims_ticket_uniq unique (event, ticket)
);
create index if not exists prize_claims_batch_idx on public.prize_claims(batch_id);
alter table public.prize_claims enable row level security;
revoke all on public.prize_claims from anon, authenticated;
grant select, delete on public.prize_claims to authenticated;   -- 넣기는 prize_claim 함수로만
select pg_temp.pol('pc_read',   'public.prize_claims', 'select', 'authenticated', 'public.is_officer()', null);
select pg_temp.pol('pc_delete', 'public.prize_claims', 'delete', 'authenticated', 'public.is_officer()', null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prize-proofs', 'prize-proofs', false, 8388608, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
select pg_temp.pol('prize_proof_insert', 'storage.objects', 'insert', 'anon, authenticated', null,
  'bucket_id = ''prize-proofs'' and (storage.foldername(name))[1] in (select e.event from public.walk_events e)');
select pg_temp.pol('prize_proof_read',   'storage.objects', 'select', 'authenticated', 'bucket_id = ''prize-proofs'' and public.is_officer()', null);
select pg_temp.pol('prize_proof_delete', 'storage.objects', 'delete', 'authenticated', 'bucket_id = ''prize-proofs'' and public.is_officer()', null);

create or replace function public.prize_claimed(p_tickets int[], p_event text)
returns setof int language sql security definer set search_path = public stable as $$
  select c.ticket from public.prize_claims c where c.event = p_event and c.ticket = any(p_tickets);
$$;
revoke all on function public.prize_claimed(int[], text) from public;
grant execute on function public.prize_claimed(int[], text) to anon, authenticated;

-- 당첨 인증 — 누구나. 인증샷을 저장소 '<회차>/<묶음 id>/' 아래에 먼저 올린 뒤 부름
create or replace function public.prize_claim(p_batch uuid, p_tickets int[], p_name text, p_church text, p_photos text[], p_event text)
returns table (ticket int, prize text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_t int; v_path text;
begin
  if p_batch is null then raise exception '인증 정보가 올바르지 않습니다. 다시 시도해 주세요.'; end if;
  if exists (select 1 from public.prize_claims c where c.batch_id = p_batch) then
    return query select c.ticket, c.prize from public.prize_claims c where c.batch_id = p_batch order by c.ticket; return;
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then raise exception '이름을 적어 주세요.'; end if;
  if char_length(btrim(coalesce(p_church, ''))) > 60 then raise exception '소속 이름은 60자까지 적을 수 있습니다.'; end if;
  if coalesce(array_length(p_tickets, 1), 0) not between 1 and 50 then raise exception '인증할 번호를 1개 이상 골라 주세요.'; end if;
  if coalesce(array_length(p_photos, 1), 0) not between 1 and 10 then raise exception '인증샷을 1장 이상(10장까지) 올려 주세요.'; end if;
  foreach v_path in array p_photos loop
    if split_part(v_path, '/', 1) <> p_event or split_part(v_path, '/', 2) <> p_batch::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'prize-proofs' and o.name = v_path) then
      raise exception '인증샷이 올라가지 않았습니다. 사진을 다시 올려 주세요.';
    end if;
  end loop;
  foreach v_t in array p_tickets loop
    if exists (select 1 from public.prize_winners w where w.event = p_event and w.ticket = v_t and w.prize = '무효표') then raise exception '%번은 무효표라 당첨 인증을 받지 않습니다.', v_t; end if;
    if not exists (select 1 from public.prize_winners w where w.event = p_event and w.ticket = v_t) then raise exception '%번은 당첨 번호가 아닙니다. 번호를 다시 확인해 주세요.', v_t; end if;
  end loop;
  return query
    insert into public.prize_claims as c (event, batch_id, ticket, prize, name, church, photo_paths, user_id)
    select p_event, p_batch, t.tk, (select string_agg(w.prize, ' · ' order by w.seq) from public.prize_winners w where w.event = p_event and w.ticket = t.tk),
           btrim(p_name), nullif(btrim(coalesce(p_church, '')), ''), p_photos, auth.uid()
    from (select distinct unnest(p_tickets) as tk) t
    on conflict (event, ticket) do nothing
    returning c.ticket, c.prize;
end $$;
revoke all on function public.prize_claim(uuid, int[], text, text, text[], text) from public;
grant execute on function public.prize_claim(uuid, int[], text, text, text[], text) to anon, authenticated;

create table if not exists public.prize_pickups (
  event          text not null references public.walk_events(event),
  ticket         int  not null,
  picked_at      timestamptz not null default now(),
  picked_by      uuid default auth.uid() references auth.users(id) on delete set null,
  picked_by_name text check (picked_by_name is null or char_length(picked_by_name) <= 60),
  primary key (event, ticket)
);
alter table public.prize_pickups enable row level security;
revoke all on public.prize_pickups from anon, authenticated;
grant select, insert, delete on public.prize_pickups to authenticated;
select pg_temp.pol('pp_read',   'public.prize_pickups', 'select', 'authenticated', 'public.is_officer()', null);
select pg_temp.pol('pp_insert', 'public.prize_pickups', 'insert', 'authenticated', null,
  'public.is_officer() and picked_by = auth.uid() and exists (select 1 from public.prize_winners w where w.event = prize_pickups.event and w.ticket = prize_pickups.ticket and w.prize <> ''무효표'')');
select pg_temp.pol('pp_delete', 'public.prize_pickups', 'delete', 'authenticated', 'public.is_officer()', null);

-- ============================================================
-- 5) 처음 회차 · 제6회 당첨 번호 (이미 있으면 그대로) ------------------
-- ============================================================
insert into public.walk_events (event, no, title, event_date, time_text, place, fee, apply_until, sponsor, hero, open)
values ('2026-6', 6, '제6회 3·1 만세길 걷기', '2026-10-18', '오후 2시 ~ 5시', '쌍봉산 근린공원', 5000, '2026-10-18', 'CTS 기독교TV · 광복회 화성시지회', false, false),
       ('2027-7', 7, '제7회 3·1 만세길 걷기', null, null, null, 5000, null, null, false, false)
on conflict (event) do nothing;
insert into public.prize_winners (event, ticket, prize, seq)
select '2026-6', t.n, p.prize, p.seq from (values
  (1, '세제', array[274,198,131,264,310,116,6]), (2, '스팀다리미', array[148]),
  (3, '두루마리휴지', array[336,363,369,99,328,380,158,96,53,304,261,280,94,154,175,95,63,132,30,18,355,147,206,217,275,23,279,103,294,386]),
  (4, '주방세제', array[14,305,399,157,337,136,285,36,359,265,238,389,308]), (5, '헤어드라이기', array[114]), (6, '주방 4종 세트', array[321,195]), (7, '태블릿 PC', array[186]),
  (8, '쌀', array[180,212,374,215,306,293,333,152,254,346,82,396,78,372,240,266,197,318,338,300]), (9, '55인치 TV', array[139,271]), (10, '태블릿 PC', array[31]),
  (11, '쌀', array[143,111,156,145,167,330,292,340,192,58,234,225,335,322,110]), (12, '인덕션 밥솥', array[384]),
  (13, '쌀', array[244,262,252,102,332,124,222,392,349,288,239,219,144,290,282,289,405,52,329]), (14, '쌀', array[404,8,343,61,231,40,260,248,98,92,105,88,373]),
  (15, '신라면 (40봉)', array[202,1,269,303,277,21,315,76]),
  (16, '보조배터리 + 쌀 500g', array[368,93,345,226,398,35,325,382,367,393,13,120,296,258,229,164,128,188,208,351,16,314,22,353,388,100,47,228,179,181,150,149,196,83,326,109,210,362,127,57,29,241,250,259,10,237,391,32,378,302,339,352,7,126,207,90,170,89,160,256,344,117,107,11,85,216,91,55,187,342,320,97,104,311,395,174,37,295,385,118,20,209,205,153,12,184,307,171,140,245,379,272,291,365,230,166,286,360,151,268,204,263,236,377,141,348,130,357,48,77,243,193,341,19,270,33,161,84,86,177,178,278,200,125,220,133,163,121,371,142,401,3,39,79,169,199,334,4,176,138,364,297,224,172,115,370,67,394]),
  (17, '보조배터리', array[2,273,309,356,235,45,155,242,203,331,38,251,159,106,281,191,253,249,129,123,135,361,347,267,189,397,301,146,313,190,247,317,233,218,119,113,381,194,255,9,400,319,358,62,402,122,87,168,257]),
  (19, '차량용 공기청정기', array[165,276,59,227,323,246,312,366,383,42]), (99, '무효표', array[5,56,214]),
  (20, '에너지바 1박스', array[350,108,46,162,134,354,60,112,64,28,390,327,34,324,185,232,387,17,223,213,211,25,403,287,15,201,26,173,41,137,27,221,24])
) as p(seq, prize, nums) cross join lateral unnest(p.nums) as t(n)
on conflict do nothing;

-- (예전 '이관' 표 walk_runs · walk_churches 는 더 쓰지 않음 — 지우지 않고 그대로 둠)
notify pgrst, 'reload schema';
select e.no as "회차", e.title as "행사", e.event_date as "날짜",
       (select count(*) from public.walk_applications w where w.event = e.event) as "신청",
       (select count(*) from public.lucky_tickets t where t.event = e.event) as "행운권",
       (select count(*) from public.prize_winners p where p.event = e.event) as "당첨 번호",
       (select count(*) from public.prize_claims c where c.event = e.event) as "당첨 인증",
       (select count(*) from public.prize_pickups k where k.event = e.event) as "수령"
from public.walk_events e order by e.no;
