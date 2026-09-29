// ============================================================
//  삼일만세운동본부 — Supabase 연결 설정 (만세운동본부 전용 프로젝트)
//  ⚠️ 만세운동본부 전용 Supabase 프로젝트를 만든 뒤 아래 두 줄을 채우면 로그인·임원방이 켜집니다.
//     위치: Supabase 대시보드 → (만세운동본부 프로젝트) → Project Settings → API
//       - Project URL          → MANSE_SUPABASE_URL
//       - Publishable(anon) key → MANSE_SUPABASE_KEY  (브라우저에 공개되어도 안전한 키 · RLS로 보호)
//     ※ service_role / secret 키는 절대 넣지 마세요.
// ============================================================
window.MANSE_SUPABASE_URL = '';
window.MANSE_SUPABASE_KEY = '';

// '회원 연동'(제휴 단체 계정 확인)에 쓰는 제휴 단체의 공개 설정
window.SAMGOE_SUPABASE_URL = 'https://xurdgazbcoxjaqkvlqff.supabase.co';
window.SAMGOE_SUPABASE_KEY = 'sb_publishable_nBJeoClbq0p5Z62_YQx3hg_0Ahhlw_v';

// 정지 계정 안내에 표시할 문의처
window.MANSE_CONTACT = '삼일만세운동본부 사무실 031-351-1179';
