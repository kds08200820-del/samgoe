-- ============================================================
--  수요조찬기도회 — 달마다 신청 받을 날짜 정하기 (2026-11-18)
--  ▶ samgoe-cc 프로젝트 SQL Editor 에서 실행 (여러 번 실행해도 안전)
--  · 기본은 첫째 주 수요일. 임원이 캘린더에서 다른 날을 누르면 그 달 신청 칸이 그 날로 옮겨짐
--  · 누구나 보기, 임원 · 관리자만 바꾸기
-- ============================================================
create table if not exists public.prayer_slots (
  ym         text primary key check (ym ~ '^\d{4}-\d{2}$'),   -- 2026-12
  slot_date  date not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  check (to_char(slot_date, 'YYYY-MM') = ym)
);
alter table public.prayer_slots enable row level security;
grant select on public.prayer_slots to anon, authenticated;
grant insert, update, delete on public.prayer_slots to authenticated;

drop policy if exists "ps_read" on public.prayer_slots;
create policy "ps_read" on public.prayer_slots for select to anon, authenticated using ( true );
drop policy if exists "ps_write" on public.prayer_slots;
create policy "ps_write" on public.prayer_slots for all to authenticated
  using ( public.is_admin() or public.is_officer() )
  with check ( public.is_admin() or public.is_officer() );

notify pgrst, 'reload schema';
select to_regclass('public.prayer_slots') is not null as "slots_table_ok";
