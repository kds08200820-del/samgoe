-- ============================================================
--  삼기연 — '삼기연이 걸어온 길' 연혁 게시판 (관리자 편집)
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 관리자(최고관리자 또는 회장)가 연혁 항목을 추가·수정·삭제하면
--    홈페이지의 '걸어온 길'에 바로 반영됩니다. (누구나 열람)
--  ▶ 먼저 setup-all.sql 이 실행되어 있어야 합니다. 재실행해도 안전합니다.
-- ============================================================

create table if not exists public.history_events (
  id         uuid default gen_random_uuid() primary key,
  badge      text,                 -- 연도/라벨 (예: 2010, 오랜 뿌리)
  title      text not null,
  body       text,
  big        boolean default false,-- 강조(굵게) 표시
  sort       int default 0,        -- 정렬 순서(작을수록 위)
  created_at timestamptz default now()
);
alter table public.history_events enable row level security;

drop policy if exists "he_read" on public.history_events;
create policy "he_read" on public.history_events for select using ( true );

drop policy if exists "he_insert" on public.history_events;
create policy "he_insert" on public.history_events for insert to authenticated with check ( public.is_admin() );
drop policy if exists "he_update" on public.history_events;
create policy "he_update" on public.history_events for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
drop policy if exists "he_delete" on public.history_events;
create policy "he_delete" on public.history_events for delete to authenticated using ( public.is_admin() );

-- 초기 연혁(역사 기록 기반) — 표가 비어 있을 때만 넣습니다.
insert into public.history_events (badge, title, body, big, sort)
select v.badge, v.title, v.body, v.big, v.sort from (values
  ('1919', '3·1 만세운동의 뿌리', '우정읍·장안면 화수리에서 일어난 3·1 만세운동. 그 함성과 헌신은, 오늘 삼괴지역 교회가 기억하고 이어가는 신앙과 나라 사랑의 뿌리가 되었습니다.', true, 10),
  ('오랜 뿌리', '교파를 넘어 한 형제로', '삼괴지역에서 교회를 섬기는 목회자들이 교단의 담을 넘어 손을 맞잡았습니다. 2009년에 이미 열 분의 증경회장을 모실 만큼, 오랜 세월 함께 걸어온 공동체입니다.', false, 20),
  ('2009', '정기총회 · 회칙 정비', '정기총회에서 회칙을 개정하고 협동총무 등 조직을 정비하며, 함께 걷는 연합 사역의 틀을 새롭게 다졌습니다.', false, 30),
  ('2010', '절기마다, 한자리에', '신년축복성회와 3·1절 기념 연합기도회, 부활절 연합예배로 지역 교회가 절기마다 한자리에 모이는 자리가 자리 잡았습니다.', false, 40),
  ('2011', '나라를 위한 무릎', '6·25 상기와 8·15 광복절 기념 연합기도회로 나라를 위해 무릎 꿇었고, 봄·가을 목회자 단합대회로 서로의 어깨를 겯었습니다.', false, 50),
  ('2012', '지역민과 함께한 은혜', '지역민을 초청한 신년축복성회에 300여 명이 함께 모여, 교회의 담을 넘어 지역과 마음을 나누는 연합회로 나아갔습니다.', false, 60),
  ('2013', '부활의 아침, 함께', '지역 기관과 함께 드린 부활주일 연합예배로 그리스도의 부활을 기념하고, 한 해의 사역을 정기총회로 정리했습니다.', false, 70),
  ('2014', '투명한 손길', '연간 결산과 재정 감사를 정착시켜, 작은 헌금 하나까지 회원 교회 앞에 책임 있고 투명하게 섬겼습니다.', false, 80),
  ('2016', '다음 세대를 심다', '지역의 학생들에게 장학금과 장학증서를 전하며, 오늘의 섬김이 내일의 열매가 되도록 다음 세대를 함께 세웠습니다.', false, 90),
  ('2018', '쉼 없이 이어진 걸음', '신년 조찬기도회, 부활절 연합예배(헌금으로 이웃 섬김), 목회자 부부 수양회, 8·15 광복절 연합예배와 정기총회로 한 해를 가득 채웠습니다.', false, 100),
  ('2026', '오늘, 그리고 내일', '목회자 부부 야유회, 지역을 향한 정책 제언, 공식 홈페이지·앱 개설 — 지나온 길을 기억하며, 다음 세대와 함께 걸어갈 길을 준비합니다.', true, 110)
) as v(badge, title, body, big, sort)
where not exists (select 1 from public.history_events);
