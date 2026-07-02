/**
 * 삼기연 갤러리 — Cloudflare R2 업로드 Worker
 * ---------------------------------------------------------------
 * 브라우저(정적 사이트)에서 R2로 직접 업로드하면 비밀키가 노출되므로,
 * 이 Worker가 중간에서 ①로그인·정회원 검증 ②R2 저장 ③이미지 서빙을 담당합니다.
 *
 * ▣ 배포 방법 (Cloudflare 대시보드) — 삼괴 전용으로 새로 생성 (운평 리소스와 분리)
 *   ※ 운평(k-logos.com)용 church-files / church-uploads 는 절대 건드리지 말 것.
 *   1) R2 → Create bucket → 이름: samgoe-gallery
 *   2) Workers & Pages → Create → Worker → 이름: samgoe-gallery → Deploy
 *      → Edit code 에 이 파일 내용 전체 붙여넣기 → Deploy
 *   3) 이 새 Worker → Settings 에서:
 *      · Variables and Secrets 에 추가:
 *          SUPABASE_URL       = https://xurdgazbcoxjaqkvlqff.supabase.co
 *          SUPABASE_ANON_KEY  = sb_publishable_nBJeoClbq0p5Z62_YQx3hg_0Ahhlw_v
 *          ADMIN_EMAIL        = kds08200820@gmail.com
 *      · Bindings → R2 bucket 추가:  Variable name = BUCKET,  R2 bucket = samgoe-gallery
 *   4) 저장 후 재배포. Worker 주소(https://samgoe-gallery.<계정>.workers.dev)를 복사해
 *      사이트의 supabase-config.js 의 R2_WORKER_URL 에 넣으면 연동 완료.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Supabase access token 검증 + 정회원 여부 확인
async function verifyUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const uRes = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!uRes.ok) return null;
  const u = await uRes.json();
  if (!u || !u.id) return null;
  let memberType = null;
  const pRes = await fetch(
    env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + u.id + '&select=member_type',
    { headers: { Authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY } }
  );
  if (pRes.ok) { const arr = await pRes.json(); if (arr && arr[0]) memberType = arr[0].member_type; }
  return { id: u.id, email: u.email, memberType };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // 이미지 서빙: GET /i/<key>
    if (request.method === 'GET' && url.pathname.startsWith('/i/')) {
      const key = decodeURIComponent(url.pathname.slice(3));
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: CORS });
      const h = new Headers(CORS);
      h.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/webp');
      h.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(obj.body, { headers: h });
    }

    // 업로드: POST /upload  (body = 이미지 바이트)
    if (request.method === 'POST' && url.pathname === '/upload') {
      const user = await verifyUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      if (user.memberType !== '정회원' && user.email !== env.ADMIN_EMAIL)
        return json({ error: '정회원만 업로드할 수 있습니다.' }, 403);
      const buf = await request.arrayBuffer();
      if (!buf || buf.byteLength === 0) return json({ error: '빈 파일입니다.' }, 400);
      if (buf.byteLength > 8 * 1024 * 1024) return json({ error: '파일이 너무 큽니다(8MB 초과).' }, 413);
      const ct = request.headers.get('Content-Type') || 'image/webp';
      const key = user.id + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.webp';
      await env.BUCKET.put(key, buf, { httpMetadata: { contentType: ct } });
      return json({ url: url.origin + '/i/' + key, key: key }, 200);
    }

    // 삭제: POST /delete  { key }
    if (request.method === 'POST' && url.pathname === '/delete') {
      const user = await verifyUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      const body = await request.json().catch(() => ({}));
      const key = body.key || '';
      const owns = key.indexOf(user.id + '/') === 0;
      if (!owns && user.email !== env.ADMIN_EMAIL) return json({ error: '삭제 권한이 없습니다.' }, 403);
      await env.BUCKET.delete(key);
      return json({ ok: true }, 200);
    }

    return new Response('삼기연 갤러리 R2 Worker · OK', { headers: CORS });
  },
};
