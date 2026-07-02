-- ============================================================
--  삼기연 갤러리 게시판 (2차) — 게시글·댓글·반응(이모티콘) 구조
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 먼저 db-setup.sql, gallery-setup.sql 이 실행되어 있어야 합니다.
--  ▶ 재실행해도 안전합니다.
-- ============================================================

-- 1) 게시글 (제목/행사명/날짜/설명)
create table if not exists public.gallery_posts (
  id          uuid default gen_random_uuid() primary key,
  title       text not null,
  event_name  text,
  event_date  date,
  body        text,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  created_at  timestamptz default now()
);
alter table public.gallery_posts enable row level security;

drop policy if exists "post_read" on public.gallery_posts;
create policy "post_read" on public.gallery_posts for select using ( true );

-- 작성: 정회원 본인만
drop policy if exists "post_insert" on public.gallery_posts;
create policy "post_insert" on public.gallery_posts for insert to authenticated with check (
  author_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.member_type = '정회원')
);

-- 수정: 본인만
drop policy if exists "post_update" on public.gallery_posts;
create policy "post_update" on public.gallery_posts for update to authenticated
  using ( author_id = auth.uid() ) with check ( author_id = auth.uid() );

-- 삭제: 본인 또는 관리자
drop policy if exists "post_delete" on public.gallery_posts;
create policy "post_delete" on public.gallery_posts for delete to authenticated using (
  author_id = auth.uid() or (auth.jwt() ->> 'email') = 'kds08200820@gmail.com'
);

-- 2) 사진 테이블에 게시글 연결 컬럼 추가 (기존 gallery_photos 재사용)
alter table public.gallery_photos add column if not exists post_id uuid references public.gallery_posts(id) on delete cascade;
alter table public.gallery_photos add column if not exists sort int default 0;

-- 3) 댓글
create table if not exists public.gallery_comments (
  id          uuid default gen_random_uuid() primary key,
  post_id     uuid references public.gallery_posts(id) on delete cascade,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  body        text not null,
  created_at  timestamptz default now()
);
alter table public.gallery_comments enable row level security;

drop policy if exists "cmt_read" on public.gallery_comments;
create policy "cmt_read" on public.gallery_comments for select using ( true );

-- 작성: 로그인한 회원 누구나 (본인 이름으로)
drop policy if exists "cmt_insert" on public.gallery_comments;
create policy "cmt_insert" on public.gallery_comments for insert to authenticated with check ( author_id = auth.uid() );

drop policy if exists "cmt_update" on public.gallery_comments;
create policy "cmt_update" on public.gallery_comments for update to authenticated
  using ( author_id = auth.uid() ) with check ( author_id = auth.uid() );

-- 삭제: 본인 또는 관리자
drop policy if exists "cmt_delete" on public.gallery_comments;
create policy "cmt_delete" on public.gallery_comments for delete to authenticated using (
  author_id = auth.uid() or (auth.jwt() ->> 'email') = 'kds08200820@gmail.com'
);

-- 4) 반응(이모티콘/좋아요) — 사용자당 게시글당 이모지 1개씩 토글
create table if not exists public.gallery_reactions (
  id         uuid default gen_random_uuid() primary key,
  post_id    uuid references public.gallery_posts(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz default now(),
  unique (post_id, user_id, emoji)
);
alter table public.gallery_reactions enable row level security;

drop policy if exists "rx_read" on public.gallery_reactions;
create policy "rx_read" on public.gallery_reactions for select using ( true );

drop policy if exists "rx_insert" on public.gallery_reactions;
create policy "rx_insert" on public.gallery_reactions for insert to authenticated with check ( user_id = auth.uid() );

drop policy if exists "rx_delete" on public.gallery_reactions;
create policy "rx_delete" on public.gallery_reactions for delete to authenticated using ( user_id = auth.uid() );

-- 5) 기존에 올라온 사진(게시글 없이 올린 것)을 자동으로 게시글로 묶기
--    같은 사람 · 같은 설명 · 같은 날짜 사진을 하나의 게시글로 모읍니다.
do $$
declare g record; pid uuid;
begin
  for g in
    select uploader_id, max(uploader_name) as uploader_name,
           coalesce(nullif(btrim(caption), ''), '갤러리 사진') as ttl,
           (created_at)::date as d, min(created_at) as first_at
    from public.gallery_photos
    where post_id is null
    group by uploader_id, coalesce(nullif(btrim(caption), ''), '갤러리 사진'), (created_at)::date
  loop
    insert into public.gallery_posts (title, event_name, event_date, author_id, author_name, created_at)
    values (g.ttl, null, g.d, g.uploader_id, g.uploader_name, g.first_at)
    returning id into pid;

    update public.gallery_photos set post_id = pid
    where post_id is null
      and uploader_id is not distinct from g.uploader_id
      and coalesce(nullif(btrim(caption), ''), '갤러리 사진') = g.ttl
      and (created_at)::date = g.d;
  end loop;
end $$;
