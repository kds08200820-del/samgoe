-- ============================================================
--  삼기연 — 3·1 만세길 걷기 참가 신청 (walk.html)
--  ▶ Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  권한
--   · 신청(등록): 누구나 (로그인 없이도 가능) — 2026-10-18 자정(한국시각)까지만
--   · 교회별 합계: 임원 · 최고관리자만 (walk_summary 함수)
--   · 전체 숫자(교회 수 · 성인 · 미성년): 정회원 · 임원 · 최고관리자 (walk_totals 함수 — 이름·교회 이름 없음)
--   · 내 신청 확인 · 고치기: 누구나 — 신청자 이름 + 교회 이름이 맞을 때 그 신청만
--     (walk_lookup · walk_update_mine 함수, 로그인 없이도 가능, 고치기는 마감 전까지)
--   · 전체 신청 내역(이름 · 교회) 보기: 임원 · 최고관리자만 (+ 본인이 로그인해서 낸 신청)
--   · 입금 확인 체크 · 삭제: 임원 · 최고관리자
-- ============================================================

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
create index if not exists walk_applications_event_idx on public.walk_applications(event, created_at);
alter table public.walk_applications enable row level security;

-- 정회원 판별 (최고관리자 · 임원 포함)
create or replace function public.is_full_member()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and (p.member_type = '정회원' or p.officer_role is not null));
$$;
revoke all on function public.is_full_member() from public;
grant execute on function public.is_full_member() to authenticated, anon;

grant insert on public.walk_applications to anon, authenticated;
grant select, update, delete on public.walk_applications to authenticated;

drop policy if exists "walk_insert" on public.walk_applications;
create policy "walk_insert" on public.walk_applications for insert to anon, authenticated
  with check ( paid = false and (user_id is null or user_id = auth.uid())
               and now() < timestamptz '2026-10-19 00:00:00+09' );  -- 10월 18일(주일)까지만 신청 받음

drop policy if exists "walk_select" on public.walk_applications;
create policy "walk_select" on public.walk_applications for select to authenticated
  using ( public.is_officer() or user_id = auth.uid() );

drop policy if exists "walk_update" on public.walk_applications;
create policy "walk_update" on public.walk_applications for update to authenticated
  using ( public.is_officer() ) with check ( public.is_officer() );

drop policy if exists "walk_delete" on public.walk_applications;
create policy "walk_delete" on public.walk_applications for delete to authenticated
  using ( public.is_officer() );

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

-- 전체 숫자 — 정회원 · 임원 · 최고관리자 (그 밖에는 빈 결과). 이름 · 교회 이름은 내보내지 않음
create or replace function public.walk_totals(p_event text default '2026-6')
returns table (churches bigint, apps bigint, adults bigint, minors bigint)
language sql security definer set search_path = public stable as $$
  select count(distinct btrim(w.church)), count(*), coalesce(sum(w.adults), 0), coalesce(sum(w.minors), 0)
  from public.walk_applications w
  where w.event = p_event
  having public.is_full_member();
$$;
revoke all on function public.walk_totals(text) from public, anon;
grant execute on function public.walk_totals(text) to authenticated;

-- 이름 · 교회 이름 비교용 (띄어쓰기 무시)
create or replace function public.walk_norm(t text)
returns text language sql immutable as $$ select regexp_replace(coalesce(t, ''), '\s', '', 'g'); $$;

-- 내 신청 확인 — 신청자 이름과 교회 이름이 모두 맞는 신청만
drop function if exists public.walk_lookup(text, text, text);
create function public.walk_lookup(p_name text, p_church text, p_event text default '2026-6')
returns table (id uuid, created_at timestamptz, name text, church text, adults int, minors int, paid boolean)
language sql security definer set search_path = public stable as $$
  select w.id, w.created_at, w.name, w.church, w.adults, w.minors, w.paid
  from public.walk_applications w
  where w.event = p_event
    and public.walk_norm(p_name) <> '' and public.walk_norm(p_church) <> ''
    and public.walk_norm(w.name)   = public.walk_norm(p_name)
    and public.walk_norm(w.church) = public.walk_norm(p_church)
  order by w.created_at desc
  limit 50;
$$;
revoke all on function public.walk_lookup(text, text, text) from public;
grant execute on function public.walk_lookup(text, text, text) to anon, authenticated;

-- 내 신청 고치기 — 조회할 때 쓴 이름 · 교회 이름이 맞아야 하고, 마감 전까지만.
--   입금이 확인된 신청은 성인 인원(참가비)을 바꿀 수 없음 → 행사 문의로
create or replace function public.walk_update_mine(
  p_id uuid, p_name text, p_church text,
  p_new_name text, p_new_church text, p_adults int, p_minors int)
returns void language plpgsql security definer set search_path = public as $$
declare w public.walk_applications;
begin
  if now() >= timestamptz '2026-10-19 00:00:00+09' then
    raise exception '참가 신청 기간이 끝나 고칠 수 없습니다.';
  end if;
  select * into w from public.walk_applications a
   where a.id = p_id
     and public.walk_norm(p_name) <> '' and public.walk_norm(p_church) <> ''
     and public.walk_norm(a.name)   = public.walk_norm(p_name)
     and public.walk_norm(a.church) = public.walk_norm(p_church)
   for update;
  if not found then
    raise exception '신청을 찾지 못했습니다. 이름과 교회 이름을 다시 확인해 주세요.';
  end if;
  if char_length(btrim(coalesce(p_new_name, ''))) not between 1 and 40 then
    raise exception '신청자 이름을 적어 주세요.';
  end if;
  if char_length(btrim(coalesce(p_new_church, ''))) not between 1 and 60 then
    raise exception '신청 교회를 적어 주세요.';
  end if;
  if coalesce(p_adults, -1) not between 0 and 300 or coalesce(p_minors, -1) not between 0 and 300 then
    raise exception '인원을 다시 확인해 주세요.';
  end if;
  if p_adults + p_minors <= 0 then
    raise exception '인원을 1명 이상 적어 주세요.';
  end if;
  if w.paid and p_adults <> w.adults then
    raise exception '입금이 확인된 신청은 성인 인원을 바꿀 수 없습니다. 행사 문의(010-4271-5090)로 연락해 주세요.';
  end if;
  update public.walk_applications
     set name = btrim(p_new_name), church = btrim(p_new_church), adults = p_adults, minors = p_minors
   where id = w.id;
end $$;
revoke all on function public.walk_update_mine(uuid, text, text, text, text, int, int) from public;
grant execute on function public.walk_update_mine(uuid, text, text, text, text, int, int) to anon, authenticated;
