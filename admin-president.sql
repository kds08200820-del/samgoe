-- ============================================================
--  삼기연 — 관리자 권한을 '회장'에게 위임
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 최고관리자(kds08200820@gmail.com)가 회장을 선정하면,
--    회장(officer_role='회장')도 회원관리·갤러리관리 권한을 갖습니다.
--    단, '임원 직책 지정(회장 선정)'은 최고관리자만 할 수 있습니다.
--  ▶ 재실행해도 안전합니다.
-- ============================================================

-- 1) 관리자 판별 함수 (최고관리자 이메일 또는 회장)
--    SECURITY DEFINER 로 실행되어 profiles 조회 시 RLS 재귀가 발생하지 않습니다.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select
    coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.officer_role = '회장'
    );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- 2) 회원(profiles) 조회·수정 권한을 '관리자(최고관리자 또는 회장)'로 확대
drop policy if exists "admin_select" on public.profiles;
create policy "admin_select" on public.profiles
  for select using ( public.is_admin() );

drop policy if exists "admin_update" on public.profiles;
create policy "admin_update" on public.profiles
  for update using ( public.is_admin() );

-- 3) 임원 직책(officer_role)은 '최고관리자'만 변경 가능 (회장도 불가)
--    → 회장이 회원 정보를 수정해도 officer_role 은 그대로 보존됩니다.
create or replace function public.protect_officer_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt() ->> 'email'), '') <> 'kds08200820@gmail.com' then
    new.officer_role := old.officer_role;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_officer on public.profiles;
create trigger trg_protect_officer before update on public.profiles
  for each row execute function public.protect_officer_role();

-- 4) 갤러리 관리(수정·삭제)도 관리자에게 허용
drop policy if exists "post_update" on public.gallery_posts;
create policy "post_update" on public.gallery_posts for update to authenticated
  using ( author_id = auth.uid() or public.is_admin() )
  with check ( author_id = auth.uid() or public.is_admin() );

drop policy if exists "post_delete" on public.gallery_posts;
create policy "post_delete" on public.gallery_posts for delete to authenticated using (
  author_id = auth.uid() or public.is_admin() );

drop policy if exists "cmt_delete" on public.gallery_comments;
create policy "cmt_delete" on public.gallery_comments for delete to authenticated using (
  author_id = auth.uid() or public.is_admin() );

drop policy if exists "gp_delete" on public.gallery_photos;
create policy "gp_delete" on public.gallery_photos for delete to authenticated using (
  uploader_id = auth.uid() or public.is_admin() );
