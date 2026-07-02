// ============================================================
//  삼괴지역기독교연합회 — Supabase 연결 설정
//  ⚠️ 아래 SUPABASE_ANON_KEY 한 줄만 채워 넣으면 로그인 기능이 켜집니다.
//     키 위치: Supabase 대시보드 → 프로젝트(xurdgazbcoxjaqkvlqff)
//              → Project Settings → API → "Project API keys"의 anon public 키
//     (anon public 키는 공개되어도 안전한 키입니다. Row Level Security로 데이터가 보호됩니다.)
// ============================================================
window.SUPABASE_URL = 'https://xurdgazbcoxjaqkvlqff.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_nBJeoClbq0p5Z62_YQx3hg_0Ahhlw_v'; // Supabase Publishable key (브라우저 공개 안전 키)

// 갤러리 사진 저장소 — Cloudflare R2 Worker 주소.
// 비워두면 Supabase Storage(1GB)에 저장, 채우면 Cloudflare R2(10GB)에 저장합니다.
// Worker 배포 후 그 주소(https://xxxx.workers.dev)를 아래 따옴표 안에 붙여넣으세요.
window.R2_WORKER_URL = '';
