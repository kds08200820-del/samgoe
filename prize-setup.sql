-- ============================================================
--  삼기연 — 제6회 3·1 만세길 걷기 경품 당첨 확인 · 당첨 인증
--  (홈페이지 첫 화면 index.html · 임원방 walk-admin.html)
--  ▶ Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  권한
--   · 당첨 번호(prize_winners): 누구나 봄 — 홈페이지에서 번호 확인
--   · 당첨 인증(prize_claims): 누구나 올림 (로그인 없이)
--       당첨 번호 여러 개 + 인증샷 여러 장을 한 번에, 이름 필수 · 소속 교회/단체는 선택
--       prize_claim 함수로만 받음 · 한 번호는 한 번만 인증
--   · 인증샷(저장소 prize-proofs, 비공개): 누구나 올림 · 임원만 봄
--   · 인증 목록 · 교회별 집계 · 삭제: 임원 · 최고관리자만 (walk-admin.html)
--   · 총 참가자 수(walk_total): 누구나 — 참가 신청 인원 합계 숫자 하나만
-- ============================================================

-- 1) 당첨 번호 ------------------------------------------------
create table if not exists public.prize_winners (
  event  text not null default '2026-6',
  ticket int  not null check (ticket between 1 and 9999),
  prize  text not null,
  seq    int  not null,                          -- 추첨 순서
  primary key (event, ticket, prize)
);
alter table public.prize_winners enable row level security;
grant select on public.prize_winners to anon, authenticated;
drop policy if exists "pw_read" on public.prize_winners;
create policy "pw_read" on public.prize_winners for select to anon, authenticated using ( true );

-- 당첨 번호 넣기 — 실행할 때마다 지우고 새로 넣음.
--   번호를 고칠 때는 아래 숫자만 고쳐서 이 파일 전체를 다시 Run 하면 됩니다.
--   5 · 56 · 214번은 무효표 — 개수에는 넣고 상품 이름을 '무효표'로 기록 (당첨 인증은 받지 않음).
--   (56 · 214번은 두 번 뽑힘, 5번은 15번을 잘못 적은 번호)
delete from public.prize_winners where event = '2026-6';
insert into public.prize_winners (event, ticket, prize, seq)
select '2026-6', t.n, p.prize, p.seq
from (values
  (1, '세제', array[274,198,131,264,310,116,6]),
  (2, '스팀다리미', array[148]),
  (3, '두루마리휴지', array[336,363,369,99,328,380,158,96,53,304,261,280,94,154,175,95,63,132,30,18,355,147,206,217,275,23,279,103,294,386]),
  (4, '주방세제', array[14,305,399,157,337,136,285,36,359,265,238,389,308]),
  (5, '헤어드라이기', array[114]),
  (6, '주방 4종 세트', array[321,195]),
  (7, '태블릿 PC', array[186]),
  (8, '쌀', array[180,212,374,215,306,293,333,152,254,346,82,396,78,372,240,266,197,318,338,300]),
  (9, '55인치 TV', array[139,271]),
  (10, '태블릿 PC', array[31]),
  (11, '쌀', array[143,111,156,145,167,330,292,340,192,58,234,225,335,322,110]),
  (12, '인덕션 밥솥', array[384]),
  (13, '쌀', array[244,262,252,102,332,124,222,392,349,288,239,219,144,290,282,289,405,52,329]),
  (14, '쌀', array[404,8,343,61,231,40,260,248,98,92,105,88,373]),
  (15, '신라면 (40봉)', array[202,1,269,303,277,21,315,76]),
  (16, '보조배터리 + 쌀 500g', array[368,93,345,226,398,35,325,382,367,393,13,120,296,258,229,164,128,188,208,351,16,314,22,353,388,100,47,228,179,181,150,149,196,83,326,109,210,362,127,57,29,241,250,259,10,237,391,32,378,302,339,352,7,126,207,90,170,89,160,256,344,117,107,11,85,216,91,55,187,342,320,97,104,311,395,174,37,295,385,118,20,209,205,153,12,184,307,171,140,245,379,272,291,365,230,166,286,360,151,268,204,263,236,377,141,348,130,357,48,77,243,193,341,19,270,33,161,84,86,177,178,278,200,125,220,133,163,121,371,142,401,3,39,79,169,199,334,4,176,138,364,297,224,172,115,370,67,394]),
  (17, '보조배터리', array[2,273,309,356,235,45,155,242,203,331,38,251,159,106,281,191,253,249,129,123,135,361,347,267,189,397,301,146,313,190,247,317,233,218,119,113,381,194,255,9,400,319,358,62,402,122,87,168,257]),
  (19, '차량용 공기청정기', array[165,276,59,227,323,246,312,366,383,42]),
  (99, '무효표', array[5,56,214]),
  (20, '에너지바 1박스', array[350,108,46,162,134,354,60,112,64,28,390,327,34,324,185,232,387,17,223,213,211,25,403,287,15,201,26,173,41,137,27,221,24])
) as p(seq, prize, nums)
cross join lateral unnest(p.nums) as t(n)
on conflict do nothing;

-- 2) 당첨 인증 ------------------------------------------------
create table if not exists public.prize_claims (
  id          uuid primary key default gen_random_uuid(),
  event       text not null default '2026-6',
  created_at  timestamptz not null default now(),
  batch_id    uuid not null,                     -- 한꺼번에 올린 인증 묶음
  ticket      int  not null,
  prize       text not null,
  name        text not null check (char_length(name) between 1 and 40),
  church      text check (church is null or char_length(church) <= 60),
  photo_paths text[] not null,
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  constraint prize_claims_ticket_uniq unique (event, ticket)
);
create index if not exists prize_claims_batch_idx on public.prize_claims(batch_id);
alter table public.prize_claims enable row level security;

-- 표에 직접 넣기 · 고치기는 막고 prize_claim 함수로만 받음
revoke insert, update on public.prize_claims from anon, authenticated;
grant select, delete on public.prize_claims to authenticated;
drop policy if exists "pc_read" on public.prize_claims;
create policy "pc_read" on public.prize_claims for select to authenticated using ( public.is_officer() );
drop policy if exists "pc_delete" on public.prize_claims;
create policy "pc_delete" on public.prize_claims for delete to authenticated using ( public.is_officer() );

-- 3) 인증샷 저장소 (비공개) ------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prize-proofs', 'prize-proofs', false, 8388608, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "prize_proof_insert" on storage.objects;
create policy "prize_proof_insert" on storage.objects for insert to anon, authenticated
  with check ( bucket_id = 'prize-proofs' and (storage.foldername(name))[1] = '2026-6' );
drop policy if exists "prize_proof_read" on storage.objects;
create policy "prize_proof_read" on storage.objects for select to authenticated
  using ( bucket_id = 'prize-proofs' and public.is_officer() );
drop policy if exists "prize_proof_delete" on storage.objects;
create policy "prize_proof_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'prize-proofs' and public.is_officer() );

-- 4) 이미 인증된 번호인지 — 누구나 (번호만 돌려줌, 이름 등은 안 보임)
create or replace function public.prize_claimed(p_tickets int[], p_event text default '2026-6')
returns setof int language sql security definer set search_path = public stable as $$
  select c.ticket from public.prize_claims c where c.event = p_event and c.ticket = any(p_tickets);
$$;
revoke all on function public.prize_claimed(int[], text) from public;
grant execute on function public.prize_claimed(int[], text) to anon, authenticated;

-- 5) 당첨 인증 — 누구나 (로그인 없이). 인증샷을 저장소 '2026-6/<묶음 id>/' 아래에 먼저 올린 뒤 부름.
--    번호 여러 개 · 사진 여러 장을 한 번에 받음. 이미 인증된 번호는 건너뛰고, 새로 인증된 번호만 돌려줌.
--    같은 묶음을 두 번 보내면(단추 연타 · 재시도) 처음 결과를 그대로 돌려줌.
drop function if exists public.prize_claim(uuid, int[], text, text, text[], text);
create function public.prize_claim(
  p_batch uuid, p_tickets int[], p_name text, p_church text, p_photos text[], p_event text default '2026-6')
returns table (ticket int, prize text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_t int; v_path text;
begin
  if p_batch is null then
    raise exception '인증 정보가 올바르지 않습니다. 다시 시도해 주세요.';
  end if;
  if exists (select 1 from public.prize_claims c where c.batch_id = p_batch) then
    return query select c.ticket, c.prize from public.prize_claims c where c.batch_id = p_batch order by c.ticket;
    return;
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception '이름을 적어 주세요.';
  end if;
  if char_length(btrim(coalesce(p_church, ''))) > 60 then
    raise exception '소속 이름은 60자까지 적을 수 있습니다.';
  end if;
  if coalesce(array_length(p_tickets, 1), 0) not between 1 and 50 then
    raise exception '인증할 번호를 1개 이상 골라 주세요.';
  end if;
  if coalesce(array_length(p_photos, 1), 0) not between 1 and 10 then
    raise exception '인증샷을 1장 이상(10장까지) 올려 주세요.';
  end if;
  foreach v_path in array p_photos loop
    if split_part(v_path, '/', 1) <> p_event or split_part(v_path, '/', 2) <> p_batch::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'prize-proofs' and o.name = v_path) then
      raise exception '인증샷이 올라가지 않았습니다. 사진을 다시 올려 주세요.';
    end if;
  end loop;
  foreach v_t in array p_tickets loop
    if exists (select 1 from public.prize_winners w where w.event = p_event and w.ticket = v_t and w.prize = '무효표') then
      raise exception '%번은 무효표라 당첨 인증을 받지 않습니다.', v_t;
    end if;
    if not exists (select 1 from public.prize_winners w where w.event = p_event and w.ticket = v_t) then
      raise exception '%번은 당첨 번호가 아닙니다. 번호를 다시 확인해 주세요.', v_t;
    end if;
  end loop;
  return query
    insert into public.prize_claims as c (event, batch_id, ticket, prize, name, church, photo_paths, user_id)
    select p_event, p_batch, t.tk,
           (select string_agg(w.prize, ' · ' order by w.seq) from public.prize_winners w
             where w.event = p_event and w.ticket = t.tk),
           btrim(p_name), nullif(btrim(coalesce(p_church, '')), ''), p_photos, auth.uid()
    from (select distinct unnest(p_tickets) as tk) t
    on conflict (event, ticket) do nothing
    returning c.ticket, c.prize;
end $$;
revoke all on function public.prize_claim(uuid, int[], text, text, text[], text) from public;
grant execute on function public.prize_claim(uuid, int[], text, text, text[], text) to anon, authenticated;

-- 6) 총 참가자 수 — 누구나 (참가 신청 인원 합계 숫자 하나만, 교회별 · 이름은 안 보임)
create or replace function public.walk_total(p_event text default '2026-6')
returns int language sql security definer set search_path = public stable as $$
  select coalesce(sum(w.adults + w.minors), 0)::int from public.walk_applications w where w.event = p_event;
$$;
revoke all on function public.walk_total(text) from public;
grant execute on function public.walk_total(text) to anon, authenticated;

-- 7) 홈페이지가 새 표 · 함수를 바로 알아보도록 + 실행 확인
--    성공하면 결과 창에 한 줄이 나옵니다: 당첨 기록 377 · 당첨 번호 377(무효표 3 포함) · 총 참가자(신청 인원 합계)
--    ('Success. No rows returned'만 나오면 전체가 실행되지 않은 것 — 전체를 선택해 다시 Run)
notify pgrst, 'reload schema';
select (select count(*) from public.prize_winners where event = '2026-6')                as "당첨 기록 (377)",
       (select count(distinct ticket) from public.prize_winners where event = '2026-6')  as "당첨 번호 (377, 무효표 3 포함)",
       public.walk_total('2026-6')                                                     as "총 참가자";
