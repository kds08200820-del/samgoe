-- ============================================================
--  삼일만세운동본부 — 언론 보도 (홈페이지 '언론 보도' 갤러리)
--  ▶ manse-setup.sql · manse-photos-setup.sql 실행 후 → 만세운동본부 Supabase 프로젝트 SQL Editor → 전체 붙여넣고 Run (여러 번 실행해도 안전)
--  ▶ 임원이 기사 주소(URL)를 넣으면 Edge Function press-meta 가 제목 · 언론사 · 날짜 · 요약 · 대표 사진을 읽어 와 채움
--    대표 사진은 사진 저장소(manse-photos)의 press/ 에 보관 → 기사 사이트가 사진을 막아도 보임. 못 가져오면 사진을 끌어다 놓기
--  권한
--   · 보기: 누구나 (공개 홈페이지)
--   · 기사 추가 · 사진 바꾸기 · 고치기: 임원 (임원 명단 재직자)
--   · 지우기: 올린 임원 · 대표회장 · 서기
-- ============================================================

-- 0) 맞는 프로젝트인지 확인 (manse-setup.sql 을 먼저)
do $$ begin
  if to_regprocedure('public.my_perms()') is null or to_regclass('public.walk_applications') is not null then
    raise exception '이 SQL은 삼일만세운동본부 Supabase 프로젝트에서, manse-setup.sql 을 먼저 실행한 뒤에 실행해야 합니다. (아무것도 바뀌지 않았습니다)';
  end if;
end $$;

-- 1) 언론 보도 ---------------------------------------------------
create table if not exists public.press (
  id           uuid primary key default gen_random_uuid(),
  url          text check (url is null or (url ~* '^https?://' and char_length(url) <= 1000)),   -- 기사 주소
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  source       text check (source is null or char_length(source) <= 80),                       -- 언론사
  published    date,                                                                            -- 보도 날짜
  year         int  not null check (year between 1919 and 2100),                                -- 보도 연도 (날짜를 모를 때도)
  summary      text check (summary is null or char_length(summary) <= 600),
  image_path   text check (image_path is null or char_length(image_path) <= 300),              -- 저장소 manse-photos 안 (press/…)
  image_url    text check (image_url is null or char_length(image_url) <= 1000),                -- 저장소에 못 옮겼을 때 기사 사이트의 사진
  sort         bigint not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  creator_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
create unique index if not exists press_url_uniq on public.press (url) where url is not null;   -- 같은 기사 두 번 X
create index if not exists press_year_idx on public.press (year desc, published desc nulls last, sort desc);

create or replace function public.press_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); new.created_by := old.created_by; new.creator_name := old.creator_name; end if;
  if new.published is not null then new.year := extract(year from new.published)::int; end if;
  return new;
end $$;
drop trigger if exists trg_press_touch on public.press;
create trigger trg_press_touch before insert or update on public.press for each row execute function public.press_touch();

alter table public.press enable row level security;
revoke all on public.press from anon, authenticated;
grant select on public.press to anon, authenticated;
grant insert, update, delete on public.press to authenticated;
drop policy if exists "pr_read" on public.press;
create policy "pr_read" on public.press for select using ( true );
drop policy if exists "pr_insert" on public.press;
create policy "pr_insert" on public.press for insert to authenticated
  with check ( public.is_officer() and created_by = auth.uid() );
drop policy if exists "pr_update" on public.press;
create policy "pr_update" on public.press for update to authenticated
  using ( public.is_officer() ) with check ( public.is_officer() );
drop policy if exists "pr_delete" on public.press;
create policy "pr_delete" on public.press for delete to authenticated
  using ( public.is_manager() or (public.is_officer() and created_by = auth.uid()) );

-- 탈퇴한 회원이 올린 기사의 '올린 이'를 익명으로
create or replace function public.anonymize_press()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    update public.press set creator_name = '탈퇴한 회원' where created_by = new.id;
  end if;
  return new;
end $$;
revoke all on function public.anonymize_press() from public, anon, authenticated;
drop trigger if exists trg_anonymize_press on public.profiles;
create trigger trg_anonymize_press after update of withdrawn_at on public.profiles
  for each row execute function public.anonymize_press();

-- 2) 처음 있던 보도 (홈페이지 파일에 있던 10건) — 이미 있으면 그대로 -------------------
insert into public.press (year, source, title, url, sort)
select v.year, v.source, v.title, nullif(v.url, ''), v.sort
from (values
  (2024, '한국정보신문', '제4회 화성 3·1운동 만세길 걷기대회, 지역민 420여명이 참여한 가운데 성료', 'http://www.kinews.pe.kr/news/310385', 3),
  (2024, '화성뉴스', '화성시, 2024 화성3·1운동만세길 걷기행사 개최', 'https://hsnewsorkr.tistory.com/8495498', 2),
  (2024, '뉴스쉐어', '화성시의회, 화성 3ㆍ1운동 만세길 걷기 행사 참석…3.1운동 정신을 걷다', 'https://m.newsshare.co.kr/1156402', 1),
  (2023, '한국정보신문', '2023 화성3.1운동만세길 걷기, 예상인원보다 많이 참여하여 성황리에 개최', 'http://www.kinews.pe.kr/news/250539', 7),
  (2023, '화성신문', '2023 화성3.1운동만세길 걷기 행사', 'http://www.ihsnews.com/sub_read.html?uid=48867', 6),
  (2023, '수원화성신문', '2023 화성3.1운동만세길 걷기 행사 성료', 'http://www.esuwon.net/114336', 5),
  (2023, '경인데일리', '화성시, ''2023 화성3.1운동만세길 걷기 행사'' 성황리 개최', '', 4),
  (2023, 'NSP통신', '화성시, 3.1운동만세길 걸으며 역사 인식 강화', '', 3),
  (2023, '위클리오늘', '2023 화성3.1운동만세길 걷기 행사 성황리 개최', '', 2),
  (2023, 'IPN뉴스 외 13곳', '2023 화성3.1운동만세길 걷기 행사 성료', '', 1)
) as v(year, source, title, url, sort)
where not exists (select 1 from public.press p where p.title = v.title and p.source is not distinct from v.source);

-- 3) 실행 확인
notify pgrst, 'reload schema';
select (select count(*) from public.press) as "언론 보도";
