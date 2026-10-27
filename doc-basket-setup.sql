-- ============================================================
--  삼기연 임원방 — 문서 바구니 + 자료실(분류 체계)
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 먼저 officer-room-setup.sql 이 실행되어 있어야 합니다.
--  ▶ 재실행해도 안전합니다.
-- ============================================================

-- 1) 자료실(폴더) 트리 — 임원 누구나 새 자료실을 만들 수 있습니다.
create table if not exists public.officer_folders (
  id          uuid default gen_random_uuid() primary key,
  code        text unique,                 -- 고정 분류 코드(기본 분류만) 예: 'gongmun'
  name        text not null,
  parent_id   uuid references public.officer_folders(id) on delete cascade,
  sort        int  default 100,
  description text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);
alter table public.officer_folders enable row level security;

drop policy if exists "ofd_read" on public.officer_folders;
create policy "ofd_read" on public.officer_folders for select to authenticated using ( public.is_officer() );
drop policy if exists "ofd_insert" on public.officer_folders;
create policy "ofd_insert" on public.officer_folders for insert to authenticated with check ( public.is_officer() );
drop policy if exists "ofd_update" on public.officer_folders;
create policy "ofd_update" on public.officer_folders for update to authenticated using ( public.is_officer() ) with check ( public.is_officer() );
drop policy if exists "ofd_delete" on public.officer_folders;
create policy "ofd_delete" on public.officer_folders for delete to authenticated using ( public.is_admin() or created_by = auth.uid() );

-- 2) 파일에 분류 정보 추가
alter table public.officer_files add column if not exists folder_id   uuid references public.officer_folders(id) on delete set null;
alter table public.officer_files add column if not exists status      text not null default 'filed';   -- 'pending'(분류 대기) | 'filed'(자료실 보관)
alter table public.officer_files add column if not exists suggested_folder_id uuid references public.officer_folders(id) on delete set null;
alter table public.officer_files add column if not exists year        int;
alter table public.officer_files add column if not exists role        text;      -- 담당 역할(회장·서기·회계 등)
alter table public.officer_files add column if not exists tags        text[] default '{}';
alter table public.officer_files add column if not exists memo        text;
alter table public.officer_files add column if not exists filed_at    timestamptz;
alter table public.officer_files add column if not exists filed_by    uuid references auth.users(id) on delete set null;
create index if not exists officer_files_folder_idx on public.officer_files(folder_id);
create index if not exists officer_files_status_idx on public.officer_files(status);

-- 분류 승인·이동·제목 수정을 위해 수정 권한 추가 (임원이면 누구나)
drop policy if exists "of_update" on public.officer_files;
create policy "of_update" on public.officer_files for update to authenticated
  using ( public.is_officer() ) with check ( public.is_officer() );

-- 3) 기본 분류 체계 (이미 있으면 건너뜀)
insert into public.officer_folders (code, name, sort, description) values
 ('gongmun',  '공문·행정',       10, '수신·발신 공문, 공고, 보조금·공모사업 서류'),
 ('meeting',  '회의 자료',       20, '총회·임원회의·월례회 회의록과 안건'),
 ('event',    '행사 진행 자료',  30, '순서지·기획안·추진계획·진행표·명단'),
 ('edu',      '교육·세미나',     40, '교육 자료집, 강의안, 세미나 자료'),
 ('history',  '역사 자료',       50, '3·1운동·만세길 역사, 연합회 연혁·기록'),
 ('finance',  '회계·결산',       60, '예산·결산·통장 사용내역·영수증'),
 ('rules',    '규정·서식',       70, '회칙, 조직표, 가입원서, 각종 양식'),
 ('media',    '사진·홍보물',     80, '포스터·현수막 시안, 행사 사진, 언론 보도'),
 ('etc',      '기타',            90, '위 분류에 들지 않는 자료')
on conflict (code) do nothing;

-- 하위 자료실
insert into public.officer_folders (code, name, parent_id, sort)
select v.code, v.name, p.id, v.sort from (values
 ('gongmun_in',   '수신 공문',          'gongmun', 1),
 ('gongmun_out',  '발신 공문',          'gongmun', 2),
 ('gongmun_grant','보조금·공모사업',     'gongmun', 3),
 ('meeting_ga',   '총회',               'meeting', 1),
 ('meeting_ofc',  '임원회의',           'meeting', 2),
 ('meeting_mon',  '월례회',             'meeting', 3),
 ('event_manse',  '만세길 걷기',        'event', 1),
 ('event_easter', '부활절 연합예배',    'event', 2),
 ('event_815',    '3·1절·광복절 기념',  'event', 3),
 ('event_newyear','신년하례·연합기도회','event', 4),
 ('event_xmas',   '성탄절',             'event', 5),
 ('event_etc',    '기타 행사',          'event', 9),
 ('history_manse','3·1운동·만세길 역사','history', 1),
 ('history_org',  '연합회 연혁·기록',   'history', 2),
 ('media_design', '포스터·현수막',      'media', 1),
 ('media_photo',  '행사 사진',          'media', 2),
 ('media_press',  '언론 보도',          'media', 3)
) as v(code, name, parent_code, sort)
join public.officer_folders p on p.code = v.parent_code
on conflict (code) do nothing;

-- 3·1 만세길 걷기 (삼일만세운동본부가 총괄하는 사업) — 공문 · 회의 자료라도 걷기 자료는 이 자료실로 따로
insert into public.officer_folders (code, name, sort, description) values
 ('walk', '3·1 만세길 걷기', 95, '삼일만세운동본부 사업 — 걷기 공문 · 보조금 · 회의 · 행사 진행 · 언론 보도 · 본부 단체 자료')
on conflict (code) do nothing;
insert into public.officer_folders (code, name, parent_id, sort)
select v.code, v.name, p.id, v.sort from (values
 ('walk_out',     '발신 공문',                   1),
 ('walk_in',      '수신 공문',                   2),
 ('walk_grant',   '보조금·공모사업',             3),
 ('walk_meeting', '회의·계획',                   4),
 ('walk_press',   '언론 보도',                   6),
 ('walk_org',     '삼일만세운동본부 단체 자료',  7)
) as v(code, name, sort)
join public.officer_folders p on p.code = 'walk'
on conflict (code) do nothing;
-- 예전 '행사 진행 자료 › 만세길 걷기'는 '3·1 만세길 걷기 › 행사 진행 자료'로
update public.officer_folders f set parent_id = p.id, name = '행사 진행 자료', sort = 5
  from public.officer_folders p
 where p.code = 'walk' and f.code = 'event_manse' and f.parent_id is distinct from p.id;
