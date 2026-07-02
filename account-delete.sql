-- ============================================================
--  삼기연 — 회원 탈퇴 기능 설정
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 회원이 마이페이지에서 '회원 탈퇴'를 누르면 이 함수가 호출되어
--    본인 계정(auth.users)과 프로필(profiles)이 함께 삭제됩니다.
--    (profiles 는 auth.users 에 ON DELETE CASCADE 로 연결되어 자동 삭제)
-- ============================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = public, auth
as $$
begin
  -- 로그인한 본인 계정만 삭제 (auth.uid() = 현재 로그인 사용자)
  delete from auth.users where id = auth.uid();
end;
$$;

-- 로그인한 회원만 실행 가능
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
