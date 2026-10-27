-- ============================================================
--  삼기연 — 회계 관리 (수입 · 지출 장부, 회계 보고 인쇄) — 임원방 → 회계 관리 (accounting.html)
--  ▶ Supabase 대시보드(삼기연 samgoe-cc 프로젝트) → SQL Editor → 아래 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ※ 삼일만세운동본부 회계는 따로입니다 (만세운동본부 프로젝트의 manse/ledger-setup.sql) — 두 장부는 섞이지 않습니다.
--  권한
--   · 장부 · 회계 보고 보기 · 인쇄: 임원 · 최고관리자
--   · 수입 · 지출 기록 · 고치기 · 지우기, 해마다 전기이월(작년에서 넘어온 돈) 넣기: 회계 · 회장 · 최고관리자
--   · 변경 기록(누가 언제 무엇을 넣고 · 고치고 · 지웠는지): 자동으로 남고 임원이 봄 — 고치거나 지울 수 없음
-- ============================================================

-- 0) 맞는 프로젝트인지 확인 — 다른 프로젝트(삼일만세운동본부 등)에서 실행하면 아무것도 바꾸지 않고 멈춤
do $$ begin
  if to_regprocedure('public.is_officer()') is null or to_regprocedure('public.my_perms()') is not null   -- my_perms 는 만세운동본부 프로젝트에만 있음
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'officer_role') then
    raise exception '이 SQL은 삼기연(samgoe-cc) Supabase 프로젝트에서 실행해야 합니다. 화면 맨 위의 프로젝트 이름이 samgoe-cc 인지 확인해 주세요. (아무것도 바뀌지 않았습니다)';
  end if;
end $$;

-- 1) 장부 ------------------------------------------------------
create table if not exists public.ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  entry_date      date not null,                                     -- 거래일
  kind            text not null check (kind in ('수입', '지출')),
  category        text not null check (char_length(btrim(category)) between 1 and 40),        -- 계정과목 (회비 · 행사비 …)
  description     text not null check (char_length(btrim(description)) between 1 and 200),    -- 적요
  amount          bigint not null check (amount between 1 and 100000000000),                  -- 원
  method          text check (method is null or char_length(method) <= 20),                    -- 계좌이체 · 현금 · 카드
  counterpart     text check (counterpart is null or char_length(counterpart) <= 80),          -- 거래처 · 낸 사람
  memo            text check (memo is null or char_length(memo) <= 300),
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_name text,
  updated_at      timestamptz,
  updated_by_name text
);
create index if not exists ledger_entries_date_idx on public.ledger_entries(entry_date, created_at);

-- 해마다 전기이월 (그해 1월 1일 잔액)
create table if not exists public.ledger_years (
  year            int primary key check (year between 2000 and 2100),
  opening_balance bigint not null default 0 check (opening_balance between -100000000000 and 100000000000),
  note            text check (note is null or char_length(note) <= 200),
  updated_at      timestamptz not null default now(),
  updated_by_name text
);

-- 변경 기록 (트리거가 자동으로 남김)
create table if not exists public.ledger_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  who       uuid default auth.uid(),
  who_name  text,
  action    text not null,          -- 기록 · 고침 · 지움 · 이월
  summary   text,
  before    jsonb,
  after     jsonb
);
create index if not exists ledger_log_at_idx on public.ledger_log(at desc);

-- 2) 권한 ------------------------------------------------------
create or replace function public.is_treasurer()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.officer_role in ('회계', '회장'));
$$;
revoke all on function public.is_treasurer() from public, anon;
grant execute on function public.is_treasurer() to authenticated;

alter table public.ledger_entries enable row level security;
alter table public.ledger_years enable row level security;
alter table public.ledger_log enable row level security;
revoke all on public.ledger_entries, public.ledger_years, public.ledger_log from anon, authenticated;
grant select, insert, update, delete on public.ledger_entries to authenticated;
grant select, insert, update on public.ledger_years to authenticated;
grant select on public.ledger_log to authenticated;

drop policy if exists "le_read" on public.ledger_entries;
create policy "le_read" on public.ledger_entries for select to authenticated using ( public.is_officer() );
drop policy if exists "le_insert" on public.ledger_entries;
create policy "le_insert" on public.ledger_entries for insert to authenticated with check ( public.is_treasurer() );
drop policy if exists "le_update" on public.ledger_entries;
create policy "le_update" on public.ledger_entries for update to authenticated using ( public.is_treasurer() ) with check ( public.is_treasurer() );
drop policy if exists "le_delete" on public.ledger_entries;
create policy "le_delete" on public.ledger_entries for delete to authenticated using ( public.is_treasurer() );

drop policy if exists "ly_read" on public.ledger_years;
create policy "ly_read" on public.ledger_years for select to authenticated using ( public.is_officer() );
drop policy if exists "ly_insert" on public.ledger_years;
create policy "ly_insert" on public.ledger_years for insert to authenticated with check ( public.is_treasurer() );
drop policy if exists "ly_update" on public.ledger_years;
create policy "ly_update" on public.ledger_years for update to authenticated using ( public.is_treasurer() ) with check ( public.is_treasurer() );

drop policy if exists "ll_read" on public.ledger_log;
create policy "ll_read" on public.ledger_log for select to authenticated using ( public.is_officer() );

-- 3) 자동 기록 — 누가 넣었는지 · 고쳤는지 이름을 붙이고 변경 기록을 남김 -------------
create or replace function public.ledger_touch()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text := (select p.name from public.profiles p where p.id = auth.uid());
begin
  v_name := coalesce(v_name, auth.jwt() ->> 'email', '알 수 없음');
  if tg_table_name = 'ledger_years' then
    new.updated_at := now(); new.updated_by_name := v_name;
    insert into public.ledger_log (who_name, action, summary, before, after)
    values (v_name, '이월', new.year || '년 전기이월 ' || new.opening_balance || '원',
            case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.created_by_name := v_name; new.updated_at := null; new.updated_by_name := null;
    insert into public.ledger_log (who_name, action, summary, after)
    values (v_name, '기록', new.entry_date || ' ' || new.kind || ' ' || new.category || ' ' || new.amount || '원 · ' || new.description, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    new.id := old.id; new.created_at := old.created_at; new.created_by := old.created_by; new.created_by_name := old.created_by_name;
    new.updated_at := now(); new.updated_by_name := v_name;
    insert into public.ledger_log (who_name, action, summary, before, after)
    values (v_name, '고침', new.entry_date || ' ' || new.kind || ' ' || new.category || ' ' || new.amount || '원 · ' || new.description, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.ledger_log (who_name, action, summary, before)
    values (v_name, '지움', old.entry_date || ' ' || old.kind || ' ' || old.category || ' ' || old.amount || '원 · ' || old.description, to_jsonb(old));
    return old;
  end if;
end $$;
revoke all on function public.ledger_touch() from public, anon, authenticated;
drop trigger if exists trg_ledger_entries_touch on public.ledger_entries;
create trigger trg_ledger_entries_touch before insert or update or delete on public.ledger_entries
  for each row execute function public.ledger_touch();
drop trigger if exists trg_ledger_years_touch on public.ledger_years;
create trigger trg_ledger_years_touch before insert or update on public.ledger_years
  for each row execute function public.ledger_touch();

-- 4) 홈페이지가 새 표를 바로 알아보도록 + 실행 확인 (결과 창에 한 줄이 나오면 성공)
notify pgrst, 'reload schema';
select (select count(*) from public.ledger_entries) as "장부 기록 (처음엔 0)",
       (select count(*) from public.ledger_years) as "전기이월 넣은 해";
