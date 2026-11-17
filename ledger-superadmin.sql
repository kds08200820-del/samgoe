-- 회계 장부: 최고관리자도 기록 · 고치기 · 지우기 가능 (2026-11-18)
-- 모든 변경은 기존 트리거(ledger_touch)가 ledger_log 에 이름과 함께 남깁니다.
create or replace function public.is_treasurer()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.officer_role = '회계');
$$;
revoke all on function public.is_treasurer() from public, anon;
grant execute on function public.is_treasurer() to authenticated;
select public.is_treasurer() as "확인";
