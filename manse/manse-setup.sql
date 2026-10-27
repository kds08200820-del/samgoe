-- ============================================================
--  삼일만세운동본부 — 기본 설정 (회원 · 임원 명단 · 권한 · 공문/자료 보관 · 회원 정지/탈퇴)
--  ▶ 만세운동본부 Supabase 프로젝트 → SQL Editor → 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ▶ 이어서 manse-photos-setup.sql → activity-media-setup.sql → manse-walk-setup.sql → ledger-setup.sql
--    (setup-sql.html 의 '삼일만세운동본부' 복사 단추는 다섯 파일을 이 순서로 한 번에 복사합니다)
--  권한 (홈페이지 화면 숨김은 편의일 뿐, 실제 판단은 여기 규칙)
--   · 회원: 가입하면 자동으로 회원 정보(profiles)가 생김 — 본인 정보만 보고 고침
--   · 임원: 임원 명단(officers)에 '재직'으로 올라 있고 그 이메일로 가입한 회원 → 임원방
--   · 운영임원: 대표회장 · 서기 (+ 최고관리자) → 임원 명단 · 회원 관리, 개인정보 자료, 정지/해제
--   · 최고관리자: kds08200820@gmail.com 으로 가입한 계정 — 처음에 임원 명단을 채우는 사람
-- ============================================================

-- 0) 맞는 프로젝트인지 확인 — 삼기연(samgoe-cc) · 교회 앱 등 다른 프로젝트에서 실행하면 아무것도 바꾸지 않고 멈춤
do $$ begin
  if to_regclass('public.walk_applications') is not null or to_regclass('public.sermons') is not null
     or (to_regclass('public.profiles') is not null
         and not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'profiles' and column_name = 'samgoe_uid')) then
    raise exception '이 SQL은 삼일만세운동본부 Supabase 프로젝트에서 실행해야 합니다. 화면 맨 위의 프로젝트 이름을 확인해 주세요. (아무것도 바뀌지 않았습니다)';
  end if;
end $$;

-- 1) 회원 정보 ---------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text,
  name             text check (name is null or char_length(name) <= 40),
  phone            text check (phone is null or char_length(phone) <= 30),
  church           text check (church is null or char_length(church) <= 60),     -- 소속
  terms_agreed_at  timestamptz,                                                  -- 약관 동의
  samgoe_uid       uuid,                                                         -- 삼괴연합회 회원 연동
  samgoe_email     text check (samgoe_email is null or char_length(samgoe_email) <= 200),
  samgoe_linked_at timestamptz,
  suspended_at     timestamptz,                                                  -- 운영임원이 정지
  suspend_note     text check (suspend_note is null or char_length(suspend_note) <= 300),
  withdrawn_at     timestamptz,                                                  -- 탈퇴 (이름 · 연락처는 지워짐)
  created_at       timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- 가입하면 회원 정보 만들기 (가입 화면에서 넣은 이름 · 연락처 · 소속 · 연동 정보)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_sg text  := m ->> 'samgoe_uid';
  v_ok boolean := coalesce(v_sg ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$', false);
begin
  insert into public.profiles (id, email, name, phone, church, terms_agreed_at, samgoe_uid, samgoe_email, samgoe_linked_at)
  values (new.id, lower(new.email),
          nullif(left(btrim(coalesce(m ->> 'name', '')), 40), ''),
          nullif(left(btrim(coalesce(m ->> 'phone', '')), 30), ''),
          nullif(left(btrim(coalesce(m ->> 'church', '')), 60), ''),
          case when m ? 'terms_agreed_at' then now() end,
          case when v_ok then v_sg::uuid end,
          case when v_ok then nullif(left(btrim(coalesce(m ->> 'samgoe_email', '')), 200), '') end,
          case when v_ok then now() end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 내 정보에서 이메일을 바꾸면 회원 정보의 이메일도 같이 (임원 명단은 이메일로 찾음)
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id and withdrawn_at is null;
  end if;
  return new;
end $$;
revoke all on function public.sync_profile_email() from public, anon, authenticated;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- 2) 임원 명단 ---------------------------------------------------
create table if not exists public.officers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  role       text not null check (char_length(btrim(role)) between 1 and 20),     -- 대표회장 · 서기 · 회계 …
  email      text check (email is null or char_length(email) <= 200),            -- 가입(로그인) 이메일 — 이 이메일로 가입하면 임원방이 열림
  church     text check (church is null or char_length(church) <= 60),
  phone      text check (phone is null or char_length(phone) <= 30),
  term       text check (term is null or char_length(term) <= 60),               -- 임기
  sort       int  not null default 100,
  note       text check (note is null or char_length(note) <= 300),
  active     boolean not null default true,                                       -- 재직 (해제하면 퇴임 — 기록은 남음)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 같은 이메일의 재직 임원은 한 명만
create unique index if not exists officers_active_email_uniq on public.officers (lower(email)) where active and email is not null;

create or replace function public.officers_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.email := nullif(lower(btrim(coalesce(new.email, ''))), ''); new.updated_at := now(); return new; end $$;
drop trigger if exists trg_officers_touch on public.officers;
create trigger trg_officers_touch before insert or update on public.officers
  for each row execute function public.officers_touch();

-- 3) 권한 ------------------------------------------------------
create or replace function public.my_email()
returns text language sql security definer set search_path = public, auth stable as $$
  select lower(u.email) from auth.users u where u.id = auth.uid();
$$;
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(public.my_email() = 'kds08200820@gmail.com', false);
$$;
-- 내 직책 (재직 중인 임원 명단에서 내 이메일로) — 정지 · 탈퇴한 회원은 없음
create or replace function public.my_officer_role()
returns text language sql security definer set search_path = public stable as $$
  select o.role from public.officers o
  where o.active and o.email is not null and lower(o.email) = public.my_email()
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and (p.suspended_at is not null or p.withdrawn_at is not null))
  order by o.sort, o.created_at limit 1;
$$;
create or replace function public.is_officer()
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_admin() or public.my_officer_role() is not null;
$$;
-- 운영임원: 대표회장 · 서기 (+ 최고관리자)
create or replace function public.is_manager()
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_admin() or coalesce(public.my_officer_role() in ('대표회장', '서기'), false);
$$;
-- 홈페이지가 한 번에 읽는 내 권한 {admin, officer, manager, role}
create or replace function public.my_perms()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('admin', public.is_admin(), 'officer', public.is_officer(),
                            'manager', public.is_manager(), 'role', public.my_officer_role());
$$;
revoke all on function public.my_email() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.my_officer_role() from public, anon;
revoke all on function public.is_officer() from public, anon;
revoke all on function public.is_manager() from public, anon;
revoke all on function public.my_perms() from public, anon;
grant execute on function public.my_email(), public.is_admin(), public.my_officer_role(),
  public.is_officer(), public.is_manager(), public.my_perms() to authenticated;

-- 4) 회원 정보 · 임원 명단 보안 규칙 ----------------------------------
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- 본인이 고칠 수 있는 칸만 (정지 · 탈퇴 · 이메일은 아래 함수와 가입 정보로만 바뀜)
grant update (name, phone, church, samgoe_uid, samgoe_email, samgoe_linked_at) on public.profiles to authenticated;
drop policy if exists "pf_read" on public.profiles;
create policy "pf_read" on public.profiles for select to authenticated
  using ( id = auth.uid() or public.is_manager() );
drop policy if exists "pf_update" on public.profiles;
create policy "pf_update" on public.profiles for update to authenticated
  using ( id = auth.uid() and withdrawn_at is null ) with check ( id = auth.uid() );

alter table public.officers enable row level security;
revoke all on public.officers from anon, authenticated;
grant select, insert, update, delete on public.officers to authenticated;
drop policy if exists "of_read" on public.officers;
create policy "of_read" on public.officers for select to authenticated using ( public.is_officer() );
drop policy if exists "of_insert" on public.officers;
create policy "of_insert" on public.officers for insert to authenticated with check ( public.is_manager() );
drop policy if exists "of_update" on public.officers;
create policy "of_update" on public.officers for update to authenticated
  using ( public.is_manager() ) with check ( public.is_manager() );
drop policy if exists "of_delete" on public.officers;
create policy "of_delete" on public.officers for delete to authenticated using ( public.is_manager() );

-- 5) 회원 정지 · 해제 (운영임원) · 탈퇴 (본인) ----------------------------
create or replace function public.admin_set_suspend(target uuid, suspend boolean, note text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_manager() then raise exception '회원 정지는 대표회장 · 서기만 할 수 있습니다.'; end if;
  if target = auth.uid() then raise exception '자기 자신은 정지할 수 없습니다.'; end if;
  if (select lower(u.email) from auth.users u where u.id = target) = 'kds08200820@gmail.com' then
    raise exception '최고관리자 계정은 정지할 수 없습니다.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target and p.withdrawn_at is null) then
    raise exception '회원을 찾지 못했습니다.';
  end if;
  if suspend then
    update auth.users set banned_until = now() + interval '100 years' where id = target;
    update public.profiles set suspended_at = now(), suspend_note = nullif(left(btrim(coalesce(note, '')), 300), '') where id = target;
  else
    update auth.users set banned_until = null where id = target;
    update public.profiles set suspended_at = null, suspend_note = null where id = target;
  end if;
end $$;
revoke all on function public.admin_set_suspend(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_suspend(uuid, boolean, text) to authenticated;

-- 탈퇴: 이름 · 연락처 · 소속 · 연동 정보를 지우고 로그인을 막음. 같은 이메일로 다시 가입할 수 있게 계정 이메일도 비움
create or replace function public.withdraw_me()
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  update public.profiles set name = '탈퇴한 회원', email = null, phone = null, church = null,
         samgoe_uid = null, samgoe_email = null, samgoe_linked_at = null, withdrawn_at = now()
   where id = v_uid and withdrawn_at is null;
  update auth.users set banned_until = now() + interval '100 years',
         email = 'deleted_' || v_uid::text || '@deleted.invalid', raw_user_meta_data = '{}'::jsonb
   where id = v_uid;
end $$;
revoke all on function public.withdraw_me() from public, anon;
grant execute on function public.withdraw_me() to authenticated;

-- 6) 공문 · 자료 보관 (임원방) ------------------------------------------
create table if not exists public.docs (
  id            uuid primary key default gen_random_uuid(),
  year          int  not null check (year between 1900 and 2100),
  category      text not null check (char_length(btrim(category)) between 1 and 40),   -- 공문(발신) · 회의록 · 회계·예산 …
  title         text not null check (char_length(btrim(title)) between 1 and 300),
  doc_date      date,
  date_text     text check (date_text is null or char_length(date_text) <= 40),
  doc_no        text check (doc_no is null or char_length(doc_no) <= 100),               -- 문서 번호
  note          text check (note is null or char_length(note) <= 1000),
  path          text check (path is null or char_length(path) <= 300),                   -- 열람용 파일 (저장소 manse-docs)
  mime          text,
  size          bigint,
  orig_path     text check (orig_path is null or char_length(orig_path) <= 300),         -- 원본(hwp 등)
  orig_name     text check (orig_name is null or char_length(orig_name) <= 300),
  sensitive     boolean not null default false,                                         -- 개인정보 포함 → 운영임원만
  uploaded_by   uuid references auth.users(id) on delete set null,
  uploader_name text,
  created_at    timestamptz not null default now()
);
create index if not exists docs_year_idx on public.docs (year desc, category, doc_date desc);
-- 3·1 만세길 걷기 자료면 회차(제N회), 본부 일반 자료는 비움 — 관리자 메뉴에서 걷기 자료를 회차별로 따로 묶음
alter table public.docs add column if not exists walk_no int check (walk_no is null or walk_no between 1 and 99);
create index if not exists docs_walk_idx on public.docs (walk_no) where walk_no is not null;
alter table public.docs enable row level security;
revoke all on public.docs from anon, authenticated;
grant select, insert, update, delete on public.docs to authenticated;
drop policy if exists "dc_read" on public.docs;
create policy "dc_read" on public.docs for select to authenticated
  using ( public.is_officer() and (not sensitive or public.is_manager()) );
drop policy if exists "dc_insert" on public.docs;
create policy "dc_insert" on public.docs for insert to authenticated
  with check ( public.is_officer() and uploaded_by = auth.uid()
               and ((not sensitive and category <> '명부·개인정보') or public.is_manager()) );
drop policy if exists "dc_update" on public.docs;
create policy "dc_update" on public.docs for update to authenticated
  using ( public.is_manager() ) with check ( public.is_manager() );
drop policy if exists "dc_delete" on public.docs;
create policy "dc_delete" on public.docs for delete to authenticated using ( public.is_manager() );

-- 자료 파일 저장소 (비공개 · 50MB) — 'private/' 로 시작하는 개인정보 자료는 운영임원만
insert into storage.buckets (id, name, public, file_size_limit)
values ('manse-docs', 'manse-docs', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists "mdocs_read" on storage.objects;
create policy "mdocs_read" on storage.objects for select to authenticated
  using ( bucket_id = 'manse-docs' and public.is_officer() and (name not like 'private/%' or public.is_manager()) );
drop policy if exists "mdocs_insert" on storage.objects;
create policy "mdocs_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'manse-docs' and public.is_officer() and (name not like 'private/%' or public.is_manager()) );
drop policy if exists "mdocs_delete" on storage.objects;
create policy "mdocs_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'manse-docs' and public.is_manager() );

-- 탈퇴한 회원이 올린 자료의 '올린 이'를 익명으로
create or replace function public.anonymize_doc_uploads()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    update public.docs set uploader_name = '탈퇴한 회원' where uploaded_by = new.id;
  end if;
  return new;
end $$;
revoke all on function public.anonymize_doc_uploads() from public, anon, authenticated;
drop trigger if exists trg_anonymize_doc_uploads on public.profiles;
create trigger trg_anonymize_doc_uploads after update of withdrawn_at on public.profiles
  for each row execute function public.anonymize_doc_uploads();

-- 7) 홈페이지가 새 표 · 함수를 바로 알아보도록 + 실행 확인
notify pgrst, 'reload schema';
select (select count(*) from public.profiles) as "회원",
       (select count(*) from public.officers where active) as "재직 임원",
       (select count(*) from public.docs) as "공문 · 자료";
