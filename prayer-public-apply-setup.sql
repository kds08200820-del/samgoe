-- ============================================================
--  수요조찬기도회 — 로그인 없이 신청 + 신청자 연락처 보호 (2026-11-18)
--  ▶ samgoe-cc 프로젝트 SQL Editor 에서 실행 (여러 번 실행해도 안전)
--  · 링크를 받은 누구나(로그인 안 해도) 빈 첫째 수요일에 '신청' 상태로만 등록 가능
--  · 신청자 이름 · 연락처는 공개 조회에서 빠지고, 관리자만 함수로 봄
-- ============================================================

-- 1) 공개 조회에서 신청자 이름 · 연락처 컬럼 숨김 (컬럼 단위 권한)
revoke select on public.prayer_meetings from anon, authenticated;
grant select (id, meet_date, host_church, topic, note, status, created_by, created_at)
  on public.prayer_meetings to anon, authenticated;

-- 2) 로그인 안 한 사람도 신청 가능 — '신청' 상태, 오늘 이후 날짜, 교회 · 이름 · 연락처 필수
grant insert on public.prayer_meetings to anon;
drop policy if exists "pm_insert_anon" on public.prayer_meetings;
create policy "pm_insert_anon" on public.prayer_meetings for insert to anon
  with check (
    status = '신청' and created_by is null and meet_date >= current_date
    and char_length(btrim(coalesce(host_church, ''))) between 1 and 60
    and char_length(btrim(coalesce(applicant_name, ''))) between 1 and 40
    and char_length(btrim(coalesce(applicant_phone, ''))) between 9 and 20
    and note is null
  );

-- 3) 관리자만 신청자 이름 · 연락처 보기
create or replace function public.prayer_applicants()
returns table (id uuid, applicant_name text, applicant_phone text)
language sql security definer set search_path = public stable as $$
  select m.id, m.applicant_name, m.applicant_phone from public.prayer_meetings m
  where public.is_admin() and (m.applicant_name is not null or m.applicant_phone is not null);
$$;
revoke all on function public.prayer_applicants() from public, anon;
grant execute on function public.prayer_applicants() to authenticated;

notify pgrst, 'reload schema';
select has_column_privilege('anon', 'public.prayer_meetings', 'applicant_phone', 'select') as "phone_public_should_be_false",
       has_table_privilege('anon', 'public.prayer_meetings', 'insert') as "anon_insert_true";
