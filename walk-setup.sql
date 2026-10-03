-- ============================================================
--  삼기연 — 3·1 만세길 걷기 참가 신청 (walk.html)
--  ▶ Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  권한 — 교회 이름 · 신청자 이름 · 인원 · 금액은 '그 교회'와 임원만 봅니다
--   · 신청(등록): 누구나 (로그인 없이도 가능, 신청 비밀번호 숫자 4자리 필수) — 2026-10-18 자정(한국시각)까지만
--                 walk_apply 함수로만 받음 (비밀번호는 암호화해서 저장)
--   · 내 신청 확인 · 고치기 (로그인 없이): 신청자 이름 + 교회 이름 + 신청 비밀번호가 모두 맞을 때 그 신청만
--                 (walk_lookup · walk_update_mine, 비밀번호 5번 틀리면 10분 동안 조회 막힘, 고치기는 마감 전까지)
--   · 우리 교회 신청 보기 (로그인): 내 회원정보의 교회와 같은 교회의 신청만 (walk_my_church)
--                 고치기는 내가 로그인해서 낸 신청만
--   · 교회별 합계 · 전체 신청 내역: 임원 · 최고관리자만 (walk_summary, 표 직접 조회)
--   · 입금 확인 체크 · 삭제: 임원 · 최고관리자
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.walk_applications (
  id         uuid primary key default gen_random_uuid(),
  event      text not null default '2026-6',
  created_at timestamptz not null default now(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  church     text not null check (char_length(btrim(church)) between 1 and 60),
  adults     int  not null check (adults between 0 and 300),
  minors     int  not null check (minors between 0 and 300),
  paid       boolean not null default false,
  user_id    uuid default auth.uid() references auth.users(id) on delete set null,
  constraint walk_people_check check (adults + minors > 0)
);
alter table public.walk_applications add column if not exists pin_hash text;          -- 신청 비밀번호(암호화)
alter table public.walk_applications add column if not exists pin_fails int not null default 0;
alter table public.walk_applications add column if not exists pin_locked_until timestamptz;
create index if not exists walk_applications_event_idx on public.walk_applications(event, created_at);
alter table public.walk_applications enable row level security;

-- 정회원 판별 (최고관리자 · 임원 포함) — 다른 곳에서도 쓸 수 있어 남겨 둠
create or replace function public.is_full_member()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and (p.member_type = '정회원' or p.officer_role is not null));
$$;
revoke all on function public.is_full_member() from public;
grant execute on function public.is_full_member() to authenticated, anon;

-- 표에 직접 넣기는 막고(비밀번호 없는 신청 방지) walk_apply 함수로만 받음
revoke insert on public.walk_applications from anon, authenticated;
drop policy if exists "walk_insert" on public.walk_applications;
grant select, update, delete on public.walk_applications to authenticated;

drop policy if exists "walk_select" on public.walk_applications;
create policy "walk_select" on public.walk_applications for select to authenticated
  using ( public.is_officer() or user_id = auth.uid() );

drop policy if exists "walk_update" on public.walk_applications;
create policy "walk_update" on public.walk_applications for update to authenticated
  using ( public.is_officer() ) with check ( public.is_officer() );

drop policy if exists "walk_delete" on public.walk_applications;
create policy "walk_delete" on public.walk_applications for delete to authenticated
  using ( public.is_officer() );

-- 이름 · 교회 이름 비교용 (띄어쓰기 무시)
create or replace function public.walk_norm(t text)
returns text language sql immutable as $$ select regexp_replace(coalesce(t, ''), '\s', '', 'g'); $$;

-- 신청 내용 검사 (신청 · 고치기 공통)
create or replace function public.walk_check(p_name text, p_church text, p_adults int, p_minors int)
returns void language plpgsql as $$
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception '신청자 이름을 적어 주세요.';
  end if;
  if char_length(btrim(coalesce(p_church, ''))) not between 1 and 60 then
    raise exception '신청 교회를 적어 주세요.';
  end if;
  if coalesce(p_adults, -1) not between 0 and 300 or coalesce(p_minors, -1) not between 0 and 300 then
    raise exception '인원을 다시 확인해 주세요.';
  end if;
  if p_adults + p_minors <= 0 then
    raise exception '인원을 1명 이상 적어 주세요.';
  end if;
end $$;

-- 신청 — 누구나, 마감 전까지, 신청 비밀번호(숫자 4자리) 필수
create or replace function public.walk_apply(
  p_name text, p_church text, p_adults int, p_minors int, p_pin text, p_event text default '2026-6')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if now() >= timestamptz '2026-10-19 00:00:00+09' then   -- 10월 18일(주일)까지만 신청 받음
    raise exception '참가 신청 기간이 끝났습니다.';
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

-- 교회별 합계 — 임원 · 최고관리자만 (그 밖에는 빈 결과)
create or replace function public.walk_summary(p_event text default '2026-6')
returns table (church text, apps bigint, adults bigint, minors bigint)
language sql security definer set search_path = public stable as $$
  select btrim(w.church), count(*), sum(w.adults), sum(w.minors)
  from public.walk_applications w
  where w.event = p_event and public.is_officer()
  group by btrim(w.church)
  order by sum(w.adults + w.minors) desc, btrim(w.church);
$$;
revoke all on function public.walk_summary(text) from public, anon;
grant execute on function public.walk_summary(text) to authenticated;

-- 정회원용 전체 숫자는 없앰 (임원만 봄)
drop function if exists public.walk_totals(text);

-- 내 신청 확인 (로그인 없이) — 이름 + 교회 이름 + 신청 비밀번호가 모두 맞는 신청만.
--   비밀번호를 5번 틀리면 그 이름 · 교회의 신청은 10분 동안 조회되지 않음
drop function if exists public.walk_lookup(text, text, text);
drop function if exists public.walk_lookup(text, text, text, text);
create function public.walk_lookup(p_name text, p_church text, p_pin text, p_event text default '2026-6')
returns table (id uuid, created_at timestamptz, name text, church text, adults int, minors int, paid boolean)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare cand uuid[]; hit uuid[];
begin
  if public.walk_norm(p_name) = '' or public.walk_norm(p_church) = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return;
  end if;
  select array_agg(w.id) into cand from public.walk_applications w
   where w.event = p_event
     and public.walk_norm(w.name)   = public.walk_norm(p_name)
     and public.walk_norm(w.church) = public.walk_norm(p_church)
     and (w.pin_locked_until is null or w.pin_locked_until <= now());
  if cand is null then return; end if;
  select array_agg(w.id) into hit from public.walk_applications w
   where w.id = any(cand) and w.pin_hash is not null and crypt(p_pin, w.pin_hash) = w.pin_hash;
  if hit is null then
    update public.walk_applications w
       set pin_fails        = case when w.pin_fails + 1 >= 5 then 0 else w.pin_fails + 1 end,
           pin_locked_until = case when w.pin_fails + 1 >= 5 then now() + interval '10 minutes' else w.pin_locked_until end
     where w.id = any(cand);
    return;
  end if;
  update public.walk_applications w set pin_fails = 0 where w.id = any(hit) and w.pin_fails <> 0;
  return query
    select w.id, w.created_at, w.name, w.church, w.adults, w.minors, w.paid
    from public.walk_applications w where w.id = any(hit)
    order by w.created_at desc;
end $$;
revoke all on function public.walk_lookup(text, text, text, text) from public;
grant execute on function public.walk_lookup(text, text, text, text) to anon, authenticated;

-- 우리 교회 신청 보기 (로그인) — 내 회원정보의 교회와 같은 교회의 신청만
create or replace function public.walk_my_church(p_event text default '2026-6')
returns table (id uuid, created_at timestamptz, name text, church text, adults int, minors int, paid boolean, mine boolean)
language sql security definer set search_path = public stable as $$
  select w.id, w.created_at, w.name, w.church, w.adults, w.minors, w.paid, coalesce(w.user_id = auth.uid(), false)
  from public.walk_applications w
  join public.profiles p on p.id = auth.uid()
  where w.event = p_event
    and public.walk_norm(p.church) <> ''
    and public.walk_norm(w.church) = public.walk_norm(p.church)
  order by w.created_at desc;
$$;
revoke all on function public.walk_my_church(text) from public, anon;
grant execute on function public.walk_my_church(text) to authenticated;

-- 내 신청 고치기 — (이름 + 교회 + 신청 비밀번호) 또는 (내가 로그인해서 낸 신청), 마감 전까지.
--   입금이 확인된 신청은 성인 인원(참가비)을 바꿀 수 없음 → 행사 문의로
drop function if exists public.walk_update_mine(uuid, text, text, text, text, int, int);
create or replace function public.walk_update_mine(
  p_id uuid, p_name text, p_church text, p_pin text,
  p_new_name text, p_new_church text, p_adults int, p_minors int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare w public.walk_applications;
begin
  if now() >= timestamptz '2026-10-19 00:00:00+09' then
    raise exception '참가 신청 기간이 끝나 고칠 수 없습니다.';
  end if;
  select * into w from public.walk_applications a where a.id = p_id for update;
  if not found or not coalesce(
       (auth.uid() is not null and coalesce(w.user_id = auth.uid(), false))
    or (coalesce(p_pin, '') ~ '^[0-9]{4}$' and w.pin_hash is not null
        and (w.pin_locked_until is null or w.pin_locked_until <= now())
        and public.walk_norm(p_name) <> '' and public.walk_norm(p_church) <> ''
        and public.walk_norm(w.name)   = public.walk_norm(p_name)
        and public.walk_norm(w.church) = public.walk_norm(p_church)
        and crypt(p_pin, w.pin_hash) = w.pin_hash)
  , false) then
    raise exception '신청을 찾지 못했습니다. 이름 · 교회 · 신청 비밀번호를 다시 확인해 주세요.';
  end if;
  perform public.walk_check(p_new_name, p_new_church, p_adults, p_minors);
  if w.paid and p_adults <> w.adults then
    raise exception '입금이 확인된 신청은 성인 인원을 바꿀 수 없습니다. 행사 문의(010-4271-5090)로 연락해 주세요.';
  end if;
  update public.walk_applications
     set name = btrim(p_new_name), church = btrim(p_new_church), adults = p_adults, minors = p_minors
   where id = w.id;
end $$;
revoke all on function public.walk_update_mine(uuid, text, text, text, text, text, int, int) from public;
grant execute on function public.walk_update_mine(uuid, text, text, text, text, text, int, int) to anon, authenticated;

-- ============================================================
--  행사가 끝난 뒤 신청 기록을 '임원 자료방'으로 옮기기 — 서기 · 회장(대표회장)만 (최고관리자 포함)
--   (walk-admin.html 의 '임원 자료방으로 옮기기' 단추 · 옮긴 기록을 남김)
-- ============================================================
create or replace function public.is_walk_archiver()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.officer_role in ('서기', '회장'));
$$;
revoke all on function public.is_walk_archiver() from public;
grant execute on function public.is_walk_archiver() to authenticated;

create table if not exists public.walk_archives (
  id               uuid primary key default gen_random_uuid(),
  event            text not null,
  created_at       timestamptz not null default now(),
  archived_by      uuid default auth.uid() references auth.users(id) on delete set null,
  archived_by_name text,
  apps             int,
  adults           int,
  minors           int,
  file_ids         uuid[]
);
alter table public.walk_archives enable row level security;
grant select, insert on public.walk_archives to authenticated;

drop policy if exists "wa_read" on public.walk_archives;
create policy "wa_read" on public.walk_archives for select to authenticated using ( public.is_officer() );

drop policy if exists "wa_insert" on public.walk_archives;
create policy "wa_insert" on public.walk_archives for insert to authenticated
  with check ( public.is_walk_archiver() and archived_by = auth.uid() );
