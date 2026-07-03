-- ============================================================
--  삼기연 — 회원 추가·수정·삭제 권한 (관리자: 최고관리자 또는 회장)
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 관리자가 명단에 회원을 직접 추가/수정/삭제할 수 있게 합니다.
--     (직접 추가한 회원은 로그인 계정 없이 '명단상 회원'으로 등록됩니다.)
--  ▶ 먼저 setup-all.sql 이 실행되어 있어야 합니다. 재실행해도 안전합니다.
-- ============================================================

-- 로그인 계정 없이도 명단에 회원을 추가할 수 있도록 auth.users 연결(외래키) 해제
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- 관리자(최고관리자 또는 회장)는 회원을 추가/삭제 가능
drop policy if exists "admin_insert" on public.profiles;
create policy "admin_insert" on public.profiles for insert to authenticated
  with check ( public.is_admin() );

drop policy if exists "admin_delete" on public.profiles;
create policy "admin_delete" on public.profiles for delete to authenticated
  using ( public.is_admin() );

-- (수정은 기존 admin_update 정책으로 이미 허용됨)

-- 외래키 해제로 자동 삭제가 사라지므로, 회원 탈퇴 시 프로필도 직접 삭제
create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
