-- 수요조찬기도회 회원 신청 기능 (2026-11-18)
-- 기존 prayer_meetings 테이블에 신청 상태/신청자 컬럼을 추가하고,
-- 로그인한 회원이 빈 첫째 수요일에 '신청' 상태로 직접 등록할 수 있게 합니다.
-- 관리자(최고관리자·회장)는 확정/삭제할 수 있습니다.

alter table public.prayer_meetings add column if not exists status text not null default '확정';   -- '신청' | '확정'
alter table public.prayer_meetings add column if not exists applicant_name text;                       -- 신청자 이름
alter table public.prayer_meetings add column if not exists applicant_phone text;                      -- 신청자 연락처

-- 같은 날짜에 하나의 기도회만
create unique index if not exists prayer_meetings_date_uq on public.prayer_meetings(meet_date);

-- 회원 신청: 로그인 사용자는 '신청' 상태로만, 본인 id로만 등록
drop policy if exists "pm_insert" on public.prayer_meetings;
create policy "pm_insert" on public.prayer_meetings for insert to authenticated
  with check ( public.is_admin() or (status = '신청' and created_by = auth.uid()) );

-- 수정(확정 처리 등)은 관리자만
drop policy if exists "pm_update" on public.prayer_meetings;
create policy "pm_update" on public.prayer_meetings for update to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- 삭제: 관리자 또는 본인이 낸 '신청' 건
drop policy if exists "pm_delete" on public.prayer_meetings;
create policy "pm_delete" on public.prayer_meetings for delete to authenticated
  using ( public.is_admin() or (status = '신청' and created_by = auth.uid()) );
