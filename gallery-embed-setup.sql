-- ============================================================
--  삼기연 — 갤러리 유튜브/인스타그램 임베드 지원
--  ▶ 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run (한 번만)
--  ▶ 먼저 gallery-board-setup.sql 이 실행되어 있어야 합니다.
--  ▶ 재실행해도 안전합니다.
--  ▶ 사진 없이 유튜브/인스타그램 링크만으로도 게시물을 올릴 수 있게 합니다.
--    (권한은 기존 gallery_posts RLS를 그대로 따릅니다 — 정회원 게시)
-- ============================================================

alter table public.gallery_posts add column if not exists embed_url  text;  -- 원본 링크
alter table public.gallery_posts add column if not exists embed_kind text;  -- 'youtube' | 'instagram'
