-- ============================================================
--  삼기연 — 제6회 3·1 만세길 걷기 경품 수령 확인 (임원방 prize-winners.html)
--  ▶ Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run (여러 번 실행해도 안전)
--    prize-setup.sql(당첨 번호 · 당첨 인증)을 먼저 실행한 뒤에 실행
--  권한 — 임원 · 최고관리자만
--   · 수령 확인 보기 · 넣기(물건을 내줄 때) · 취소(잘못 누른 경우)
--   · 당첨 번호만 수령 확인할 수 있음 (무효표 제외). 홈페이지에서 인증하지 않은 번호도
--     현장에서 번호표를 보여 주고 받아 가면 확인할 수 있음
--   · 남은 수량 = 상품별 당첨 수 − 수령 확인 수 (화면에서 계산)
-- ============================================================

create table if not exists public.prize_pickups (
  event          text not null default '2026-6',
  ticket         int  not null,
  picked_at      timestamptz not null default now(),
  picked_by      uuid default auth.uid() references auth.users(id) on delete set null,
  picked_by_name text check (picked_by_name is null or char_length(picked_by_name) <= 60),   -- 확인한 임원 이름
  primary key (event, ticket)
);
alter table public.prize_pickups enable row level security;

revoke all on public.prize_pickups from anon;
grant select, insert, delete on public.prize_pickups to authenticated;

drop policy if exists "pp_read" on public.prize_pickups;
create policy "pp_read" on public.prize_pickups for select to authenticated
  using ( public.is_officer() );

drop policy if exists "pp_insert" on public.prize_pickups;
create policy "pp_insert" on public.prize_pickups for insert to authenticated
  with check (
    public.is_officer()
    and picked_by = auth.uid()
    and exists (select 1 from public.prize_winners w
                 where w.event = prize_pickups.event and w.ticket = prize_pickups.ticket and w.prize <> '무효표')
  );

drop policy if exists "pp_delete" on public.prize_pickups;
create policy "pp_delete" on public.prize_pickups for delete to authenticated
  using ( public.is_officer() );

-- 홈페이지가 새 표를 바로 알아보도록 + 실행 확인 (결과 창에 한 줄이 나오면 성공)
notify pgrst, 'reload schema';
select (select count(*) from public.prize_pickups where event = '2026-6') as "수령 확인 (처음엔 0)",
       (select count(*) from public.prize_winners where event = '2026-6' and prize <> '무효표') as "경품 수량";
