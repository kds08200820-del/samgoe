/**
 * 삼기연 — Cloudflare R2 Worker (갤러리 사진 + 임원 자료방 파일)
 * ---------------------------------------------------------------
 * 브라우저(정적 사이트)에서 R2로 직접 업로드하면 비밀키가 노출되므로,
 * 이 Worker가 중간에서 ①로그인·권한 검증 ②R2 저장 ③서빙을 담당합니다.
 *
 * ▣ 배포/갱신 방법 (Cloudflare 대시보드)
 *   1) Workers 및 Pages → samgoe-gallery → Edit code → 이 파일 내용 전체 붙여넣기 → Deploy
 *   2) Settings 에 아래가 설정되어 있어야 합니다:
 *      · Variables and Secrets:
 *          SUPABASE_URL       = https://xurdgazbcoxjaqkvlqff.supabase.co
 *          SUPABASE_ANON_KEY  = sb_publishable_nBJeoClbq0p5Z62_YQx3hg_0Ahhlw_v
 *          ADMIN_EMAIL        = kds08200820@gmail.com
 *      · Bindings → R2 bucket:  Variable name = BUCKET,  R2 bucket = samgoe-gallery
 *
 * ▣ 엔드포인트
 *   GET  /i/<key>       사진 서빙 (갤러리)
 *   POST /upload        사진 업로드 (정회원/관리자) — 본문=이미지 바이트
 *   POST /delete        사진 삭제 {key}
 *   GET  /f/<key>       임원 자료 파일 다운로드 (임원)
 *   POST /file          임원 자료 업로드 (임원) — 본문=파일 바이트, 헤더 X-Filename
 *   POST /file-delete   임원 자료 삭제 {key}
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-filename',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Supabase access token 검증 + 회원구분/임원직책 조회
async function verifyUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const uRes = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!uRes.ok) return null;
  const u = await uRes.json();
  if (!u || !u.id) return null;
  let memberType = null, officerRole = null;
  const pRes = await fetch(
    env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + u.id + '&select=member_type,officer_role',
    { headers: { Authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY } }
  );
  if (pRes.ok) { const arr = await pRes.json(); if (arr && arr[0]) { memberType = arr[0].member_type; officerRole = arr[0].officer_role; } }
  return { id: u.id, email: u.email, memberType, officerRole };
}
function isAdmin(user, env) { return user.email === env.ADMIN_EMAIL || user.officerRole === '회장'; }
function isOfficer(user, env) { return user.email === env.ADMIN_EMAIL || !!user.officerRole; }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ---------- 사진 서빙: GET /i/<key> ----------
    if (request.method === 'GET' && url.pathname.startsWith('/i/')) {
      const key = decodeURIComponent(url.pathname.slice(3));
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: CORS });
      const h = new Headers(CORS);
      h.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/webp');
      h.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(obj.body, { headers: h });
    }

    // ---------- 파일 다운로드: GET /f/<key> ----------
    if (request.method === 'GET' && url.pathname.startsWith('/f/')) {
      const key = decodeURIComponent(url.pathname.slice(3));
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: CORS });
      const h = new Headers(CORS);
      h.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream');
      h.set('Content-Disposition', (obj.httpMetadata && obj.httpMetadata.contentDisposition) || 'attachment');
      h.set('Cache-Control', 'private, max-age=3600');
      return new Response(obj.body, { headers: h });
    }

    // ---------- 사진 업로드: POST /upload ----------
    if (request.method === 'POST' && url.pathname === '/upload') {
      const user = await verifyUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      if (user.memberType !== '정회원' && !isAdmin(user, env))
        return json({ error: '정회원만 업로드할 수 있습니다.' }, 403);
      const buf = await request.arrayBuffer();
      if (!buf || buf.byteLength === 0) return json({ error: '빈 파일입니다.' }, 400);
      if (buf.byteLength > 8 * 1024 * 1024) return json({ error: '파일이 너무 큽니다(8MB 초과).' }, 413);
      const ct = request.headers.get('Content-Type') || 'image/webp';
      const key = user.id + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.webp';
      await env.BUCKET.put(key, buf, { httpMetadata: { contentType: ct } });
      return json({ url: url.origin + '/i/' + key, key: key }, 200);
    }

    // ---------- 사진 삭제: POST /delete ----------
    if (request.method === 'POST' && url.pathname === '/delete') {
      const user = await verifyUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      const body = await request.json().catch(() => ({}));
      const key = body.key || '';
      const owns = key.indexOf(user.id + '/') === 0;
      if (!owns && !isAdmin(user, env)) return json({ error: '삭제 권한이 없습니다.' }, 403);
      await env.BUCKET.delete(key);
      return json({ ok: true }, 200);
    }

    // ---------- 임원 자료 업로드: POST /file ----------
    if (request.method === 'POST' && url.pathname === '/file') {
      const user = await verifyUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      if (!isOfficer(user, env)) return json({ error: '임원만 업로드할 수 있습니다.' }, 403);
      const buf = await request.arrayBuffer();
      if (!buf || buf.byteLength === 0) return json({ error: '빈 파일입니다.' }, 400);
      if (buf.byteLength > 25 * 1024 * 1024) return json({ error: '파일이 너무 큽니다(25MB 초과).' }, 413);
      const ct = request.headers.get('Content-Type') || 'application/octet-stream';
      let name = 'file';
      try { name = decodeURIComponent(request.headers.get('X-Filename') || 'file'); } catch (_) {}
      const key = 'officer/' + user.id + '/' + Date.now() + '_' + Math.random().toString(36).slice(2);
      await env.BUCKET.put(key, buf, { httpMetadata: {
        contentType: ct,
        contentDisposition: "attachment; filename*=UTF-8''" + encodeURIComponent(name),
      }});
      return json({ url: url.origin + '/f/' + key, key: key, name: name, size: buf.byteLength, mime: ct }, 200);
    }

    // ---------- 임원 자료 삭제: POST /file-delete ----------
    if (request.method === 'POST' && url.pathname === '/file-delete') {
      const user = await verifyUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      const body = await request.json().catch(() => ({}));
      const key = body.key || '';
      const owns = key.indexOf('officer/' + user.id + '/') === 0;
      if (!owns && !isAdmin(user, env)) return json({ error: '삭제 권한이 없습니다.' }, 403);
      await env.BUCKET.delete(key);
      return json({ ok: true }, 200);
    }

    // ---------- 관리자: 회원 임시비밀번호 부여: POST /admin-set-password ----------
    // body: { userId, password }  ·  최고관리자(ADMIN_EMAIL) 또는 회장만 가능
    if (request.method === 'POST' && url.pathname === '/admin-set-password') {
      const user = await verifyUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      if (!isAdmin(user, env)) return json({ error: '관리자만 사용할 수 있습니다.' }, 403);
      if (!env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: '서버에 SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. (Worker 시크릿 등록 필요)' }, 500);
      const body = await request.json().catch(() => ({}));
      const targetId = body.userId || '';
      const newPw = body.password || '';
      if (!targetId) return json({ error: '대상 회원을 찾을 수 없습니다.' }, 400);
      if (!newPw || String(newPw).length < 6) return json({ error: '임시 비밀번호는 6자 이상이어야 합니다.' }, 400);
      const r = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users/' + encodeURIComponent(targetId), {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: String(newPw) }),
      });
      if (!r.ok) {
        let t = ''; try { t = await r.text(); } catch (_) {}
        return json({ error: '비밀번호 변경 실패(' + r.status + ') ' + t.slice(0, 200) }, 502);
      }
      return json({ ok: true }, 200);
    }

    // ---------- 임원: 기사 URL 메타데이터(og) 불러오기: POST /fetch-meta ----------
    // body: { url }  ·  임원만 · 기사 페이지의 og:title/og:image/og:description/og:site_name 추출
    if (request.method === 'POST' && url.pathname === '/fetch-meta') {
      const user = await verifyUser(request, env);
      if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
      if (!isOfficer(user, env)) return json({ error: '임원만 사용할 수 있습니다.' }, 403);
      const body = await request.json().catch(() => ({}));
      const target = (body.url || '').trim();
      if (!/^https?:\/\//i.test(target)) return json({ error: '올바른 URL(https://…)이 아닙니다.' }, 400);
      let res;
      try { res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SamgoeBot/1.0)' }, redirect: 'follow' }); }
      catch (e) { return json({ error: '기사 페이지를 불러오지 못했습니다.' }, 502); }
      if (!res.ok) return json({ error: '기사 페이지 응답 오류(' + res.status + ')' }, 502);
      let html = await res.text();
      if (html.length > 800000) html = html.slice(0, 800000);
      const dec = (s) => String(s || '')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
      const meta = (keys) => {
        for (const k of keys) {
          const re = new RegExp('<meta[^>]+(?:property|name)=["\\\']' + k + '["\\\'][^>]*>', 'i');
          const tag = html.match(re);
          if (tag) { const c = tag[0].match(/content=["\']([^"\']*)["\']/i); if (c && c[1]) return dec(c[1]); }
        }
        return '';
      };
      let title = meta(['og:title', 'twitter:title']);
      if (!title) { const t = html.match(/<title[^>]*>([^<]*)<\/title>/i); if (t) title = dec(t[1]); }
      let host = ''; try { host = new URL(target).hostname.replace(/^www\./, ''); } catch (_) {}
      // 보도 날짜 추출: 메타태그 → JSON-LD datePublished → 본문 날짜 패턴
      let dateRaw = meta(['article:published_time', 'og:article:published_time', 'datePublished', 'date', 'sailthru.date', 'pubdate', 'article:modified_time']);
      if (!dateRaw) { const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/i); if (m) dateRaw = m[1]; }
      let published = '';
      if (dateRaw) { const d = new Date(dateRaw); if (!isNaN(d.getTime())) published = d.getFullYear() + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + ('0' + d.getDate()).slice(-2); }
      if (!published) { const m2 = html.match(/(20[0-2]\d)[.\-\/](\d{1,2})[.\-\/](\d{1,2})/); if (m2 && +m2[2] >= 1 && +m2[2] <= 12 && +m2[3] >= 1 && +m2[3] <= 31) published = m2[1] + '.' + ('0' + (+m2[2])).slice(-2) + '.' + ('0' + (+m2[3])).slice(-2); }
      return json({
        title: title,
        image: meta(['og:image', 'twitter:image', 'twitter:image:src']),
        summary: meta(['og:description', 'twitter:description', 'description']),
        source: meta(['og:site_name']) || host,
        published: published,
      }, 200);
    }

    return new Response('삼기연 R2 Worker · OK', { headers: CORS });
  },
};
