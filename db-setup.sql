-- ============================================================
--  삼기연 회원 시스템 — Supabase DB 설정
--  ▶ 실행 방법: Supabase 대시보드 → SQL Editor → 새 쿼리에 아래 전체를 붙여넣고 Run
--  (한 번만 실행하면 됩니다.)
-- ============================================================

-- 1) 회원 프로필 테이블
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  name         text,           -- 이름
  address      text,           -- 주소
  phone        text,           -- 전화번호
  church       text,           -- 교회명
  member_type  text default '일반회원',   -- '정회원' | '일반회원'
  officer_role text,           -- 회장/부회장/증경회장/사무총장/서기/부서기/회계/실무위원 (없으면 NULL)
  created_at   timestamptz default now()
);

alter table public.profiles enable row level security;

-- 2) 신규 가입 시 프로필 자동 생성 (회원가입 시 넘긴 메타데이터를 복사)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, address, phone, church, member_type)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'church',
    coalesce(new.raw_user_meta_data ->> 'member_type', '일반회원')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) 접근 권한 (RLS) — 재귀를 피하려고 관리자는 JWT의 email로 판별
--    ▶ 관리자를 추가/변경하려면 아래 이메일 부분을 바꾸세요.
drop policy if exists "own_select" on public.profiles;
create policy "own_select" on public.profiles
  for select using ( auth.uid() = id );

drop policy if exists "admin_select" on public.profiles;
create policy "admin_select" on public.profiles
  for select using ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );

drop policy if exists "admin_update" on public.profiles;
create policy "admin_update" on public.profiles
  for update using ( (auth.jwt() ->> 'email') = 'kds08200820@gmail.com' );

-- 본인 프로필 수정 (이름/주소/전화/교회)
drop policy if exists "own_update" on public.profiles;
create policy "own_update" on public.profiles
  for update using ( auth.uid() = id ) with check ( auth.uid() = id );

-- 직책(officer_role)은 관리자만 변경 가능 — 일반 회원이 본인 정보를 수정해도 직책은 그대로 보존
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

-- (INSERT는 위 트리거가 security definer로 처리하므로 별도 정책 불필요)

-- 4) 이미 가입한 계정 백필 — 트리거는 '신규 가입'에만 동작하므로,
--    이 SQL을 실행하기 전에 가입한 계정들(관리자 포함)의 프로필을 만들어 줍니다.
insert into public.profiles (id, email, name, address, phone, church, member_type)
select id, email,
       raw_user_meta_data ->> 'name',
       raw_user_meta_data ->> 'address',
       raw_user_meta_data ->> 'phone',
       raw_user_meta_data ->> 'church',
       coalesce(raw_user_meta_data ->> 'member_type', '일반회원')
from auth.users
on conflict (id) do nothing;
