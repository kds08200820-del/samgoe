-- ============================================================
--  삼기연 — 3·1 만세길 걷기 행운권 QR 등록 (lucky.html · 임원방 lucky-admin.html)
--  ▶ Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ▶ walk-setup.sql · walk-events-setup.sql(회차 표)을 먼저 실행한 뒤에 실행합니다.
--  행운권 한 장 = 번호 하나 + QR 코드 하나. QR 안에는 그 장만의 확인 코드(8자리)가 들어 있어
--  번호만 알아서는 남의 행운권을 등록할 수 없습니다.
--  권한
--   · 행운권 한 장의 정보(번호 · 행사명 · 등록 여부): QR(확인 코드)을 가진 사람만 그 한 장 (lucky_info)
--   · 등록(이름 · 생년월일 · 소속 · 휴대폰 번호(선택)) — 소속은 church 칸에 저장 (교회 · 의용소방대 · 방범대 등): QR을 가진 누구나, 로그인 없이, 한 장에 한 번 (lucky_register)
--       다른 사람의 행운권도 대신 등록할 수 있음 (어르신 돕기) — 그 사람의 이름 · 생년월일로
--       한 사람(이름 + 생년월일이 같은 사람)은 한 회차에 한 장만 등록됨 — 두 번째는 안내 문구와 함께 막음
--   · 행운권 만들기(번호 범위) · 행사명 · 이미지 · 등록 받기 켜고 끄기: 임원 · 최고관리자
--   · 등록 내용 보기 · 고치기 · 대신 등록 · 등록 취소: 임원 · 최고관리자
--   · 만든 행운권 지우기: 임원, 아직 등록되지 않은 장만
--   · 등록 정보 모두 지우기(경품 지급을 마친 뒤): 서기 · 대표회장 · 최고관리자
--   · 행운권 이미지(저장소 lucky-art): 누구나 봄 (등록 페이지 · 인쇄용) · 임원만 올리고 지움
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) 회차별 행운권 설정 ------------------------------------------
create table if not exists public.lucky_events (
  event      text primary key references public.walk_events(event) on delete cascade,
  title      text check (title is null or char_length(btrim(title)) between 1 and 80),   -- 행운권에 넣을 행사명 (비우면 회차 이름)
  subtitle   text check (subtitle is null or char_length(subtitle) <= 120),           -- 행사명 아래 작은 글씨 (날짜 · 장소 등)
  art_path   text check (art_path is null or char_length(art_path) <= 200),         -- 행운권 이미지 (저장소 lucky-art 안의 경로)
  open       boolean not null default true,                                         -- QR 등록 받기
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.lucky_events enable row level security;
revoke all on public.lucky_events from anon, authenticated;
grant select on public.lucky_events to anon, authenticated;
grant insert, update on public.lucky_events to authenticated;

drop policy if exists "le_read" on public.lucky_events;
create policy "le_read" on public.lucky_events for select to anon, authenticated using ( true );
drop policy if exists "le_insert" on public.lucky_events;
create policy "le_insert" on public.lucky_events for insert to authenticated with check ( public.is_officer() );
drop policy if exists "le_update" on public.lucky_events;
create policy "le_update" on public.lucky_events for update to authenticated
  using ( public.is_officer() ) with check ( public.is_officer() );

create or replace function public.lucky_events_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_lucky_events_touch on public.lucky_events;
create trigger trg_lucky_events_touch before update on public.lucky_events
  for each row execute function public.lucky_events_touch();

-- 2) 행운권 (등록 내용도 같은 줄에 — 한 장에 한 사람) -------------------
create table if not exists public.lucky_tickets (
  event         text not null references public.walk_events(event),   -- 행운권이 있는 회차는 지울 수 없음
  no            int  not null check (no between 1 and 99999),
  code          text not null unique check (code ~ '^[A-Z2-9]{8}$'), -- QR 안의 확인 코드
  created_at    timestamptz not null default now(),
  name          text check (name is null or char_length(btrim(name)) between 1 and 40),
  birth         date,
  church        text check (church is null or char_length(btrim(church)) between 1 and 60),
  registered_at timestamptz,
  reg_user      uuid references auth.users(id) on delete set null,   -- 로그인한 채 등록했으면 그 계정
  updated_by    text,                                                -- 임원이 고치거나 대신 등록했으면 그 이름
  primary key (event, no),
  constraint lucky_reg_all check (
    (name is null and birth is null and church is null and registered_at is null)
    or (name is not null and birth is not null and church is not null and registered_at is not null))
);
create index if not exists lucky_tickets_reg_idx on public.lucky_tickets(event, registered_at);
alter table public.lucky_tickets enable row level security;

-- 당첨 안내를 받을 휴대폰 번호 (선택, 숫자만 — 01012345678)
alter table public.lucky_tickets add column if not exists phone text;
alter table public.lucky_tickets drop constraint if exists lucky_phone_check;
alter table public.lucky_tickets add constraint lucky_phone_check
  check (phone is null or (phone ~ '^01[016789][0-9]{7,8}$' and registered_at is not null));

-- 한 사람은 한 회차에 한 장만 — 이름(띄어쓰기 · 대소문자 무시) + 생년월일이 같으면 같은 사람
create or replace function public.lucky_pkey(p text)
returns text language sql immutable as $$ select lower(regexp_replace(coalesce(p, ''), '\s', '', 'g')); $$;
do $$
begin
  if exists (select 1 from public.lucky_tickets where registered_at is not null
             group by event, public.lucky_pkey(name), birth having count(*) > 1) then
    raise notice '같은 사람이 두 장 이상 등록된 기록이 있어 한 사람 한 장 규칙(색인)을 아직 걸지 못했습니다. 임원방에서 정리한 뒤 이 파일을 다시 실행해 주세요. (등록 화면에서는 이미 막힙니다)';
  else
    create unique index if not exists lucky_person_uniq on public.lucky_tickets (event, public.lucky_pkey(name), birth)
      where registered_at is not null;
  end if;
end $$;

-- 표에 직접 넣기는 막고(확인 코드는 서버에서만 만듦) lucky_make 함수로만 만듦
-- 임원이 고칠 수 있는 칸은 등록 내용뿐 (번호 · 확인 코드는 못 바꿈)
revoke all on public.lucky_tickets from anon, authenticated;
grant select, delete on public.lucky_tickets to authenticated;
grant update (name, birth, church, phone, registered_at, reg_user, updated_by) on public.lucky_tickets to authenticated;

drop policy if exists "lt_read" on public.lucky_tickets;
create policy "lt_read" on public.lucky_tickets for select to authenticated using ( public.is_officer() );
drop policy if exists "lt_update" on public.lucky_tickets;
create policy "lt_update" on public.lucky_tickets for update to authenticated
  using ( public.is_officer() ) with check ( public.is_officer() );
drop policy if exists "lt_delete" on public.lucky_tickets;
create policy "lt_delete" on public.lucky_tickets for delete to authenticated
  using ( public.is_officer() and registered_at is null );

-- 확인 코드 — 헷갈리는 글자(0 · O · 1 · I · L)를 뺀 31자 중 8자리, 암호용 난수로 만듦
create or replace function public.lucky_code()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(8); s text := ''; i int;
begin
  for i in 0..7 loop s := s || substr(a, (get_byte(b, i) % 31) + 1, 1); end loop;
  return s;
end $$;
revoke all on function public.lucky_code() from public, anon, authenticated;

-- 손으로 적은 코드도 받도록 — 띄어쓰기 · 붙임표 빼고 대문자로
create or replace function public.lucky_norm(p text)
returns text language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')); $$;

-- 이름 가리기 — 홍길동 → 홍*동, 홍길 → 홍*
create or replace function public.lucky_mask(p text)
returns text language sql immutable as $$
  select case when p is null then null
              when char_length(btrim(p)) <= 1 then '*'
              when char_length(btrim(p)) = 2 then left(btrim(p), 1) || '*'
              else left(btrim(p), 1) || repeat('*', char_length(btrim(p)) - 2) || right(btrim(p), 1) end;
$$;

-- 3) 행운권 만들기 — 임원. 번호 범위를 주면 아직 없는 번호만 새로 만들고, 새로 만든 장 수를 돌려줌 --
create or replace function public.lucky_make(p_event text, p_from int, p_to int)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_new int := 0; v_n int; i int;
begin
  if not public.is_officer() then
    raise exception '임원만 행운권을 만들 수 있습니다.';
  end if;
  if not exists (select 1 from public.walk_events e where e.event = p_event) then
    raise exception '회차를 찾지 못했습니다.';
  end if;
  if p_from is null or p_to is null or p_from < 1 or p_to > 99999 or p_from > p_to then
    raise exception '번호 범위를 다시 확인해 주세요. (1 ~ 99999, 시작 번호 ≤ 끝 번호)';
  end if;
  if p_to - p_from + 1 > 3000 then
    raise exception '한 번에 3000장까지 만들 수 있습니다. 범위를 나눠서 만들어 주세요.';
  end if;
  -- 확인 코드가 우연히 겹친 번호는 건너뛰므로, 빠진 번호가 없을 때까지 몇 번 더 채움
  for i in 1..5 loop
    insert into public.lucky_tickets (event, no, code)
    select p_event, n, public.lucky_code() from generate_series(p_from, p_to) n
    where not exists (select 1 from public.lucky_tickets t where t.event = p_event and t.no = n)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_new := v_new + v_n;
    exit when not exists (select 1 from generate_series(p_from, p_to) n
                          where not exists (select 1 from public.lucky_tickets t where t.event = p_event and t.no = n));
  end loop;
  insert into public.lucky_events (event) values (p_event) on conflict (event) do nothing;
  return v_new;
end $$;
revoke all on function public.lucky_make(text, int, int) from public, anon;
grant execute on function public.lucky_make(text, int, int) to authenticated;

-- 4) 행운권 한 장 보기 — 누구나, 확인 코드를 알 때만 (이름은 가려서, 생년월일 · 소속은 안 보임) ----
drop function if exists public.lucky_info(text);
create function public.lucky_info(p_code text)
returns table (event text, no int, title text, subtitle text, art_path text, open boolean,
               registered boolean, masked_name text, registered_at timestamptz,
               event_title text, event_date date, place text, contact text)
language sql security definer set search_path = public stable as $$
  select t.event, t.no, coalesce(le.title, e.title), le.subtitle, le.art_path, coalesce(le.open, true),
         t.registered_at is not null, public.lucky_mask(t.name), t.registered_at,
         e.title, e.event_date, e.place, e.contact
  from public.lucky_tickets t
  join public.walk_events e on e.event = t.event
  left join public.lucky_events le on le.event = t.event
  where t.code = public.lucky_norm(p_code);
$$;
revoke all on function public.lucky_info(text) from public;
grant execute on function public.lucky_info(text) to anon, authenticated;

-- 5) 행운권 등록 — 누구나 (로그인 없이), 한 장에 한 번. 다른 사람의 행운권도 대신 등록할 수 있음.
--    한 사람(이름 + 생년월일)은 한 회차에 한 장만 — 두 번째 장은 막고 안내함
--    같은 내용으로 한 번 더 보내면(단추 연타 · 재시도) 등록된 것으로 그대로 돌려줌
drop function if exists public.lucky_register(text, text, date, text);
drop function if exists public.lucky_register(text, text, date, text, text);
create function public.lucky_register(p_code text, p_name text, p_birth date, p_church text, p_phone text default null)
returns table (event text, no int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare t public.lucky_tickets; v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  select * into t from public.lucky_tickets x where x.code = public.lucky_norm(p_code) for update;
  if not found then
    raise exception '행운권을 찾지 못했습니다. QR 코드를 다시 찍어 주세요.';
  end if;
  if t.registered_at is not null then
    if t.name = btrim(coalesce(p_name, '')) and t.birth = p_birth and t.church = btrim(coalesce(p_church, '')) then
      return query select t.event, t.no;
      return;
    end if;
    raise exception '이미 등록된 행운권입니다.';
  end if;
  if not coalesce((select le.open from public.lucky_events le where le.event = t.event), true) then
    raise exception '지금은 행운권 등록을 받지 않습니다.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception '이름을 적어 주세요.';
  end if;
  if p_birth is null or p_birth < date '1900-01-01' or p_birth > (now() at time zone 'Asia/Seoul')::date then
    raise exception '생년월일을 다시 확인해 주세요.';
  end if;
  if char_length(btrim(coalesce(p_church, ''))) not between 1 and 60 then
    raise exception '소속을 적어 주세요. (교회 · 의용소방대 · 방범대 등) 소속이 없으면 ''없음''이라고 적어 주세요.';
  end if;
  if v_phone is not null and v_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception '휴대폰 번호를 다시 확인해 주세요. (예: 010-1234-5678) 번호 없이 등록하려면 칸을 비워 주세요.';
  end if;
  if exists (select 1 from public.lucky_tickets x
             where x.event = t.event and x.registered_at is not null and x.no <> t.no
               and public.lucky_pkey(x.name) = public.lucky_pkey(p_name) and x.birth = p_birth) then
    raise exception '% 님(% 생)은 이미 행운권을 등록하셨습니다. 한 분은 행운권 한 장만 등록할 수 있습니다.',
      btrim(p_name), to_char(p_birth, 'YYYY.MM.DD');
  end if;
  begin
    update public.lucky_tickets x
       set name = btrim(p_name), birth = p_birth, church = btrim(p_church), phone = v_phone, registered_at = now(), reg_user = auth.uid()
     where x.event = t.event and x.no = t.no;
  exception when unique_violation then   -- 같은 사람이 두 장을 동시에 보낸 경우
    raise exception '% 님(% 생)은 이미 행운권을 등록하셨습니다. 한 분은 행운권 한 장만 등록할 수 있습니다.',
      btrim(p_name), to_char(p_birth, 'YYYY.MM.DD');
  end;
  return query select t.event, t.no;
end $$;
revoke all on function public.lucky_register(text, text, date, text, text) from public;
grant execute on function public.lucky_register(text, text, date, text, text) to anon, authenticated;

-- 6) 등록 정보 모두 지우기 — 서기 · 대표회장 · 최고관리자. 경품 지급을 마친 뒤 개인정보 파기용.
--    행운권(번호 · QR)은 남기고 이름 · 생년월일 · 소속 · 휴대폰 번호만 지우며, 등록 받기도 끔. 지운 장 수를 돌려줌
create or replace function public.lucky_wipe(p_event text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_walk_archiver() then
    raise exception '서기 · 대표회장만 등록 정보를 모두 지울 수 있습니다.';
  end if;
  insert into public.lucky_events (event, open) values (p_event, false)
  on conflict (event) do update set open = false;
  update public.lucky_tickets t
     set name = null, birth = null, church = null, phone = null, registered_at = null, reg_user = null, updated_by = null
   where t.event = p_event and t.registered_at is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.lucky_wipe(text) from public, anon;
grant execute on function public.lucky_wipe(text) to authenticated;

-- 7) 행운권 이미지 저장소 (공개 — 등록 페이지 · 인쇄용 PDF에 씀, 개인정보 없음) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lucky-art', 'lucky-art', true, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lucky_art_insert" on storage.objects;
create policy "lucky_art_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'lucky-art' and public.is_officer() );
drop policy if exists "lucky_art_read" on storage.objects;
create policy "lucky_art_read" on storage.objects for select to authenticated
  using ( bucket_id = 'lucky-art' and public.is_officer() );
drop policy if exists "lucky_art_delete" on storage.objects;
create policy "lucky_art_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'lucky-art' and public.is_officer() );

-- 8) 홈페이지가 새 표 · 함수를 바로 알아보도록 + 실행 확인
--    성공하면 결과 창에 회차마다 한 줄이 나옵니다 (처음엔 만든 행운권 0)
--    ('Success. No rows returned'만 나오면 전체가 실행되지 않은 것 — 전체를 선택해 다시 Run)
notify pgrst, 'reload schema';
select e.no as "회차", e.title as "행사",
       (select count(*) from public.lucky_tickets t where t.event = e.event) as "만든 행운권",
       (select count(*) from public.lucky_tickets t where t.event = e.event and t.registered_at is not null) as "등록"
from public.walk_events e order by e.no;
