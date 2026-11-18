-- ============================================================
--  수요조찬기도회 — 임원이 캘린더에서 날짜 조정 (2026-11-18)
--  ▶ samgoe-cc 프로젝트 SQL Editor 에서 실행 (여러 번 실행해도 안전)
--  · 임원(직책이 있는 사람)과 최고관리자 · 회장은 기도회 날짜 · 교회 · 상태를 고칠 수 있음
--  · 삭제는 기존대로 관리자 또는 본인이 낸 신청 건만
-- ============================================================
drop policy if exists "pm_update" on public.prayer_meetings;
create policy "pm_update" on public.prayer_meetings for update to authenticated
  using ( public.is_admin() or public.is_officer() )
  with check ( public.is_admin() or public.is_officer() );

notify pgrst, 'reload schema';
select count(*) as "pm_update_policy_1_ok" from pg_policies
 where tablename = 'prayer_meetings' and policyname = 'pm_update' and qual like '%is_officer%';
