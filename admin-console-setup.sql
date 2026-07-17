-- ============================================================
--  삼기연 관리자 콘솔 백엔드
--  2등급 권한 · 개인정보 마스킹 · 감사로그(불변) · 소프트삭제/복구 · 1:1 문의 · 대시보드
--  ▶ 실행: Supabase → SQL Editor → 붙여넣고 Run (한 번만). 재실행 안전.
--  ▶ 최고관리자 = kds08200820@gmail.com / 일반관리자 = profiles.admin_role='staff'
-- ============================================================

-- 0) 컬럼 ----------------------------------------------------
alter table public.profiles add column if not exists admin_role text;   -- null | 'staff'(일반관리자)
alter table public.profiles add column if not exists deleted_by uuid;   -- 관리자 삭제 시 관리자 id(자진탈퇴는 null)

-- 1) 권한 헬퍼 ----------------------------------------------
create or replace function public.is_super() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((auth.jwt() ->> 'email') = 'kds08200820@gmail.com', false);
$$;
create or replace function public.is_console_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_super() or exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.admin_role = 'staff' and p.deleted_at is null);
$$;
revoke all on function public.is_super() from public, anon;
revoke all on function public.is_console_admin() from public, anon;
grant execute on function public.is_super() to authenticated;
grant execute on function public.is_console_admin() to authenticated;

-- 2) 마스킹 함수 --------------------------------------------
create or replace function public.mask_phone(p text) returns text language plpgsql immutable as $$
declare d text; begin
  if p is null or p='' then return p; end if;
  d := regexp_replace(p,'\D','','g');
  if length(d) < 7 then return '***'; end if;
  return left(d,3)||'-****-'||right(d,4);
end; $$;
create or replace function public.mask_addr(a text) returns text language plpgsql immutable as $$
begin
  if a is null or a='' then return a; end if;
  return trim(split_part(a,' ',1)||' '||split_part(a,' ',2))||' ****';
end; $$;
create or replace function public.mask_email(e text) returns text language plpgsql immutable as $$
declare loc text; dom text; begin
  if e is null or position('@' in e)=0 then return e; end if;
  loc := split_part(e,'@',1); dom := split_part(e,'@',2);
  if length(loc) <= 2 then return left(loc,1)||'***@'||dom; end if;
  return left(loc,2)||'***@'||dom;
end; $$;

-- 3) 감사 로그 (append-only, 수정·삭제 불가) -----------------
create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  actor_email  text,
  action       text not null,     -- view_full|suspend|unsuspend|soft_delete|restore|set_role|answer_inquiry
  target_id    uuid,
  target_label text,
  detail       text,
  created_at   timestamptz default now()
);
alter table public.audit_logs enable row level security;
drop policy if exists "al_read" on public.audit_logs;
create policy "al_read" on public.audit_logs for select to authenticated using ( public.is_console_admin() );
-- insert/update/delete 정책 없음 → 사용자 키로는 불가. 기록은 아래 audit() 함수로만.
-- 수정·삭제를 물리적으로 차단(테이블 소유자/서비스롤조차 트리거를 지워야만 가능 → 변조 흔적):
create or replace function public.audit_immutable() returns trigger
language plpgsql as $$ begin raise exception 'audit_logs is append-only'; end; $$;
drop trigger if exists trg_audit_immutable on public.audit_logs;
create trigger trg_audit_immutable before update or delete on public.audit_logs
  for each row execute function public.audit_immutable();

create or replace function public.audit(p_action text, p_target uuid, p_label text, p_detail text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_console_admin() then raise exception 'forbidden'; end if;
  insert into public.audit_logs(actor_id, actor_email, action, target_id, target_label, detail)
  values (auth.uid(), auth.jwt()->>'email', p_action, p_target, p_label, p_detail);
end; $$;
revoke all on function public.audit(text,uuid,text,text) from public, anon;
grant execute on function public.audit(text,uuid,text,text) to authenticated;

-- 4) 회원 목록 (마스킹) — 콘솔 관리자(두 등급) ---------------
drop function if exists public.admin_list_members(text);
create or replace function public.admin_list_members(p_search text default null)
returns table (id uuid, email text, name text, church text, member_type text, officer_role text,
  admin_role text, phone_mask text, address_mask text, created_at timestamptz, status text, suspend_reason text)
language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_console_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, public.mask_email(u.email::text), p.name, p.church, p.member_type, p.officer_role,
    p.admin_role, public.mask_phone(p.phone), public.mask_addr(p.address), p.created_at,
    case when p.deleted_at is not null and p.deleted_by is not null then 'deleted'
         when p.deleted_at is not null then 'withdrawn'
         when p.suspended_at is not null or (u.banned_until is not null and u.banned_until>now()) then 'suspended'
         else 'active' end,
    p.suspend_reason
  from public.profiles p join auth.users u on u.id=p.id
  where p_search is null or p_search=''
     or u.email ilike '%'||p_search||'%' or coalesce(p.name,'') ilike '%'||p_search||'%'
  order by p.created_at desc limit 300;
end; $$;
revoke all on function public.admin_list_members(text) from public, anon;
grant execute on function public.admin_list_members(text) to authenticated;

-- 5) 전체 보기(원본) — 열람 기록 남기고 원본 반환 (두 등급) --
create or replace function public.admin_reveal_member(p_id uuid)
returns table (phone text, address text, email text)
language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_console_admin() then raise exception 'forbidden'; end if;
  perform public.audit('view_full', p_id, (select name from public.profiles where id=p_id), '민감정보 전체보기');
  return query select p.phone, p.address, u.email::text
    from public.profiles p join auth.users u on u.id=p.id where p.id=p_id;
end; $$;
revoke all on function public.admin_reveal_member(uuid) from public, anon;
grant execute on function public.admin_reveal_member(uuid) to authenticated;

-- 6) 정지 / 해제 — 최고관리자만 + 로그 ----------------------
create or replace function public.admin_set_suspend(p_id uuid, p_suspend boolean, p_reason text default null)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_email text;
begin
  if not public.is_super() then raise exception 'forbidden'; end if;
  if p_id = auth.uid() then raise exception 'cannot act on self'; end if;
  select email into v_email from auth.users where id=p_id;
  if v_email = 'kds08200820@gmail.com' then raise exception 'cannot suspend superadmin'; end if;
  if exists(select 1 from public.profiles where id=p_id and deleted_at is not null) then raise exception 'deleted member'; end if;
  if p_suspend then
    update auth.users set banned_until = now()+interval '100 years' where id=p_id;
    update public.profiles set suspended_at=now(), suspend_reason=p_reason where id=p_id;
    perform public.audit('suspend', p_id, (select name from public.profiles where id=p_id), p_reason);
  else
    update auth.users set banned_until=null where id=p_id;
    update public.profiles set suspended_at=null, suspend_reason=null where id=p_id;
    perform public.audit('unsuspend', p_id, (select name from public.profiles where id=p_id), null);
  end if;
end; $$;
revoke all on function public.admin_set_suspend(uuid,boolean,text) from public, anon;
grant execute on function public.admin_set_suspend(uuid,boolean,text) to authenticated;

-- 7) 관리자 소프트삭제 / 복구 — 최고관리자만 + 로그(익명화 없음) --
create or replace function public.admin_soft_delete_member(p_id uuid, p_restore boolean, p_reason text default null)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_email text;
begin
  if not public.is_super() then raise exception 'forbidden'; end if;
  if p_id = auth.uid() then raise exception 'cannot act on self'; end if;
  select email into v_email from auth.users where id=p_id;
  if v_email = 'kds08200820@gmail.com' then raise exception 'cannot delete superadmin'; end if;
  if p_restore then
    update public.profiles set deleted_at=null, deleted_by=null where id=p_id;
    update auth.users set banned_until=null where id=p_id;
    perform public.audit('restore', p_id, (select name from public.profiles where id=p_id), null);
  else
    -- 소프트삭제: 데이터는 보존(복구 가능), 로그인만 차단. 개인정보 익명화하지 않음.
    update public.profiles set deleted_at=now(), deleted_by=auth.uid() where id=p_id and deleted_at is null;
    update auth.users set banned_until = now()+interval '100 years' where id=p_id;
    perform public.audit('soft_delete', p_id, (select name from public.profiles where id=p_id), p_reason);
  end if;
end; $$;
revoke all on function public.admin_soft_delete_member(uuid,boolean,text) from public, anon;
grant execute on function public.admin_soft_delete_member(uuid,boolean,text) to authenticated;

-- 8) 관리자 등급 지정 — 최고관리자만 + 로그 ------------------
create or replace function public.admin_set_role(p_id uuid, p_staff boolean)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_email text;
begin
  if not public.is_super() then raise exception 'forbidden'; end if;
  select email into v_email from auth.users where id=p_id;
  if v_email = 'kds08200820@gmail.com' then raise exception 'superadmin fixed'; end if;
  update public.profiles set admin_role = case when p_staff then 'staff' else null end where id=p_id;
  perform public.audit('set_role', p_id, (select name from public.profiles where id=p_id),
    case when p_staff then '일반관리자 지정' else '일반관리자 해제' end);
end; $$;
revoke all on function public.admin_set_role(uuid,boolean) from public, anon;
grant execute on function public.admin_set_role(uuid,boolean) to authenticated;

-- 9) 1:1 문의 --------------------------------------------------
create table if not exists public.inquiries (
  id bigint generated always as identity primary key,
  author_id uuid references auth.users(id) on delete set null,
  author_name text, author_email text,
  subject text not null, body text,
  status text default 'open',        -- open | answered
  answer text, answered_by uuid, answered_at timestamptz,
  created_at timestamptz default now()
);
alter table public.inquiries enable row level security;
drop policy if exists "iq_insert" on public.inquiries;
create policy "iq_insert" on public.inquiries for insert to authenticated with check ( author_id = auth.uid() );
drop policy if exists "iq_read" on public.inquiries;
create policy "iq_read" on public.inquiries for select to authenticated using ( author_id = auth.uid() or public.is_console_admin() );
-- 답변은 아래 RPC로만 (직접 update 금지)
create index if not exists inquiries_status_idx on public.inquiries(status, created_at desc);

create or replace function public.admin_answer_inquiry(p_id bigint, p_answer text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_console_admin() then raise exception 'forbidden'; end if;
  update public.inquiries set answer=p_answer, status='answered', answered_by=auth.uid(), answered_at=now() where id=p_id;
  perform public.audit('answer_inquiry', null, '문의#'||p_id, left(coalesce(p_answer,''),80));
end; $$;
revoke all on function public.admin_answer_inquiry(bigint,text) from public, anon;
grant execute on function public.admin_answer_inquiry(bigint,text) to authenticated;

-- 10) 대시보드 지표 -------------------------------------------
create or replace function public.admin_dashboard()
returns json language plpgsql security definer set search_path=public,auth as $$
declare r json;
begin
  if not public.is_console_admin() then raise exception 'forbidden'; end if;
  select json_build_object(
    'new_inquiries',  (select count(*) from public.inquiries where status='open'),
    'total_inquiries',(select count(*) from public.inquiries),
    'suspended',      (select count(*) from public.profiles where suspended_at is not null and deleted_at is null),
    'deleted',        (select count(*) from public.profiles where deleted_at is not null and deleted_by is not null),
    'withdrawn',      (select count(*) from public.profiles where deleted_at is not null and deleted_by is null),
    'recent_signups', (select count(*) from public.profiles where created_at >= now()-interval '7 days'),
    'active_members', (select count(*) from public.profiles where deleted_at is null),
    'staff_admins',   (select count(*) from public.profiles where admin_role='staff' and deleted_at is null)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
