-- ============================================================
--  삼기연 — 3·1 만세길 걷기 참가 신청 (walk.html)
--  ▶ Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  권한
--   · 신청(등록): 누구나 (로그인 없이도 가능) — 2026-10-18 자정(한국시각)까지만
--   · 교회별 합계: 임원 · 최고관리자만 (walk_summary 함수)
--   · 내 신청 확인: 누구나 — 신청자 이름 + 교회 이름이 맞을 때 그 신청만 (walk_lookup 함수, 로그인 없이도 가능)
--   · 전체 신청 내역 보기: 정회원 · 임원 · 최고관리자 (+ 본인이 로그인해서 낸 신청)
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
  using ( public.is_full_member() or user_id = auth.uid() );

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

-- 내 신청 확인 — 신청자 이름과 교회 이름이 모두 맞는 신청만 (띄어쓰기는 무시)
create or replace function public.walk_lookup(p_name text, p_church text, p_event text default '2026-6')
returns table (created_at timestamptz, name text, church text, adults int, minors int, paid boolean)
language sql security definer set search_path = public stable as $$
  select w.created_at, w.name, w.church, w.adults, w.minors, w.paid
  from public.walk_applications w
  where w.event = p_event
    and char_length(regexp_replace(coalesce(p_name, ''),   '\s', '', 'g')) > 0
    and char_length(regexp_replace(coalesce(p_church, ''), '\s', '', 'g')) > 0
    and regexp_replace(w.name,   '\s', '', 'g') = regexp_replace(p_name,   '\s', '', 'g')
    and regexp_replace(w.church, '\s', '', 'g') = regexp_replace(p_church, '\s', '', 'g')
  order by w.created_at desc
  limit 50;
$$;
revoke all on function public.walk_lookup(text, text, text) from public;
grant execute on function public.walk_lookup(text, text, text) to anon, authenticated;
