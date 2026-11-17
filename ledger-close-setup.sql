-- ============================================================
--  삼기연 회계 — 회계연도 마감 · 다음 해 장부 시작 (2026-11-18)
--  ▶ samgoe-cc 프로젝트 SQL Editor 에서 실행 (여러 번 실행해도 안전)
--  · 마감: 그해 차기이월(잔액)을 계산해 저장하고, 다음 해 전기이월로 자동으로 넣음
--  · 마감된 해의 수입 · 지출은 넣기 · 고치기 · 지우기가 서버에서 막힘
--  · 마감 풀기: 회계 · 최고관리자만. 마감 · 마감 풀기 모두 변경 기록에 남음
-- ============================================================

alter table public.ledger_years add column if not exists closed boolean not null default false;
alter table public.ledger_years add column if not exists closing_balance bigint;
alter table public.ledger_years add column if not exists closed_at timestamptz;
alter table public.ledger_years add column if not exists closed_by_name text;

-- 변경 기록: 마감 · 마감 풀기를 이월과 구분해서 남김
create or replace function public.ledger_touch()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text := (select p.name from public.profiles p where p.id = auth.uid());
begin
  v_name := coalesce(v_name, auth.jwt() ->> 'email', '알 수 없음');
  if tg_table_name = 'ledger_years' then
    new.updated_at := now(); new.updated_by_name := v_name;
    if tg_op = 'UPDATE' and old.closed is distinct from new.closed then
      insert into public.ledger_log (who_name, action, summary, before, after)
      values (v_name, case when new.closed then '마감' else '마감 풀기' end,
              new.year || '년 회계 ' || case when new.closed then '마감 · 차기이월 ' || coalesce(new.closing_balance, 0) || '원' else '마감 풀기' end,
              to_jsonb(old), to_jsonb(new));
    else
      insert into public.ledger_log (who_name, action, summary, before, after)
      values (v_name, '이월', new.year || '년 전기이월 ' || new.opening_balance || '원',
              case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.created_by_name := v_name; new.updated_at := null; new.updated_by_name := null;
    insert into public.ledger_log (who_name, action, summary, after)
    values (v_name, '기록', new.entry_date || ' ' || new.kind || ' ' || new.category || ' ' || new.amount || '원 · ' || new.description, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    new.id := old.id; new.created_at := old.created_at; new.created_by := old.created_by; new.created_by_name := old.created_by_name;
    new.updated_at := now(); new.updated_by_name := v_name;
    insert into public.ledger_log (who_name, action, summary, before, after)
    values (v_name, '고침', new.entry_date || ' ' || new.kind || ' ' || new.category || ' ' || new.amount || '원 · ' || new.description, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.ledger_log (who_name, action, summary, before)
    values (v_name, '지움', old.entry_date || ' ' || old.kind || ' ' || old.category || ' ' || old.amount || '원 · ' || old.description, to_jsonb(old));
    return old;
  end if;
end $$;
revoke all on function public.ledger_touch() from public, anon, authenticated;

-- 마감된 해는 장부를 바꿀 수 없음 (화면을 우회해도 서버에서 막음)
create or replace function public.ledger_guard_closed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'ledger_years' then
    if old.closed and new.closed and old.opening_balance is distinct from new.opening_balance then
      raise exception '%년은 마감되어 전기이월을 고칠 수 없습니다. 먼저 마감을 풀어 주세요.', old.year;
    end if;
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and exists (select 1 from public.ledger_years y where y.closed and y.year = extract(year from old.entry_date)::int) then
    raise exception '%년은 마감되어 고치거나 지울 수 없습니다. 먼저 마감을 풀어 주세요.', extract(year from old.entry_date)::int;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and exists (select 1 from public.ledger_years y where y.closed and y.year = extract(year from new.entry_date)::int) then
    raise exception '%년은 마감되어 기록할 수 없습니다. 먼저 마감을 풀어 주세요.', extract(year from new.entry_date)::int;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.ledger_guard_closed() from public, anon, authenticated;
drop trigger if exists trg_ledger_entries_guard on public.ledger_entries;
create trigger trg_ledger_entries_guard before insert or update or delete on public.ledger_entries
  for each row execute function public.ledger_guard_closed();
drop trigger if exists trg_ledger_years_guard on public.ledger_years;
create trigger trg_ledger_years_guard before update on public.ledger_years
  for each row execute function public.ledger_guard_closed();

-- 마감하고 다음 해 시작
create or replace function public.ledger_close_year(p_year int)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_open bigint; v_close bigint;
begin
  if not public.is_treasurer() then raise exception '회계 마감은 회계 · 최고관리자만 할 수 있습니다.'; end if;
  insert into public.ledger_years (year, opening_balance) values (p_year, 0) on conflict (year) do nothing;
  select opening_balance into v_open from public.ledger_years where year = p_year;
  if (select closed from public.ledger_years where year = p_year) then raise exception '%년은 이미 마감되었습니다.', p_year; end if;
  select v_open + coalesce(sum(case when kind = '수입' then amount else -amount end), 0) into v_close
    from public.ledger_entries where entry_date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31);
  update public.ledger_years set closed = true, closing_balance = v_close, closed_at = now(),
         closed_by_name = coalesce((select p.name from public.profiles p where p.id = auth.uid()), auth.jwt() ->> 'email')
   where year = p_year;
  insert into public.ledger_years (year, opening_balance, note)
  values (p_year + 1, v_close, p_year || '년 마감 잔액에서 이월')
  on conflict (year) do update set opening_balance = excluded.opening_balance, note = excluded.note
   where not public.ledger_years.closed;
  return v_close;
end $$;
revoke all on function public.ledger_close_year(int) from public, anon;
grant execute on function public.ledger_close_year(int) to authenticated;

-- 마감 풀기
create or replace function public.ledger_reopen_year(p_year int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_treasurer() then raise exception '마감 풀기는 회계 · 최고관리자만 할 수 있습니다.'; end if;
  if exists (select 1 from public.ledger_years where year = p_year + 1 and closed) then
    raise exception '%년이 이미 마감되어 있어 %년 마감을 풀 수 없습니다. 뒤 해부터 풀어 주세요.', p_year + 1, p_year;
  end if;
  update public.ledger_years set closed = false, closed_at = null, closed_by_name = null where year = p_year and closed;
end $$;
revoke all on function public.ledger_reopen_year(int) from public, anon;
grant execute on function public.ledger_reopen_year(int) to authenticated;

notify pgrst, 'reload schema';
select (select count(*) from information_schema.columns where table_name = 'ledger_years' and column_name in ('closed','closing_balance','closed_at','closed_by_name')) as "new_cols_4_ok",
       to_regprocedure('public.ledger_close_year(int)') is not null as "close_fn_ok";
