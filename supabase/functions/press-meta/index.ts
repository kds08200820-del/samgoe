// ============================================================
//  press-meta — 기사 주소(URL)로 제목 · 언론사 · 보도 날짜 · 요약 · 대표 사진 읽어 오기 (만세운동본부 Supabase 프로젝트의 Edge Function)
//  · 만세운동본부 임원만 (보낸 로그인 표로 my_perms 를 물어 확인)
//  · 대표 사진은 사진 저장소 manse-photos 의 press/ 에 그 임원의 권한으로 저장 → 기사 사이트가 사진을 막아도 홈페이지에서 보임
//    저장하지 못하면 기사 사이트의 사진 주소(image_url)만 돌려줌 — 홈페이지에서 사진을 끌어다 놓아 바꿀 수 있음
//  · 옛 한국 신문 사이트의 EUC-KR 글자도 읽음
//  · 배포: verify_jwt = false (로그인 표는 함수 안에서 my_perms 로 직접 확인)
// ============================================================
const ORIGINS = ['https://samgoe-cc.or.kr', 'https://www.samgoe-cc.or.kr', 'https://kds08200820-del.github.io', 'http://localhost:9000'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BUCKET = 'manse-photos';

function cors(req: Request): Record<string, string> {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}
function reply(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' } });
}
// 이 프로젝트의 공개 키 (PostgREST · 저장소에 임원의 로그인 표와 함께 보냄)
function anonKey(): string {
  const k = Deno.env.get('SUPABASE_ANON_KEY');
  if (k) return k;
  try { const s: Record<string, string> = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'); return s.default || Object.values(s)[0] || ''; } catch (_) { return ''; }
}
function dec(s: string): string {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
// 글자 인코딩을 알아내 HTML 읽기 (EUC-KR 등)
export function readHtml(buf: Uint8Array, contentType: string): string {
  let cs = (/charset=["']?([\w-]+)/i.exec(contentType || '') || [])[1] || '';
  if (!cs) {
    const head = new TextDecoder('latin1').decode(buf.subarray(0, 8192));
    cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1] || '';
  }
  cs = cs.toLowerCase();
  if (/^(ks_c_5601|ksc5601|cp949|x-windows-949|euc_kr)/.test(cs)) cs = 'euc-kr';
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch (_) { return new TextDecoder('utf-8').decode(buf); }
}
// 기사 HTML에서 제목 · 언론사 · 날짜 · 요약 · 사진 주소 찾기
export function parseMeta(html: string, pageUrl: string) {
  const meta = (keys: string[]): string => {
    for (const k of keys) {
      const re = new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']' + k.replace(/[:.]/g, '\\$&') + '["\'][^>]*>', 'i');
      const tag = html.match(re);
      if (tag) { const c = tag[0].match(/content=["']([^"']*)["']/i) || tag[0].match(/content=([^\s>]+)/i); if (c && c[1]) return dec(c[1]); }
    }
    return '';
  };
  let host = ''; try { host = new URL(pageUrl).hostname.replace(/^(www|m)\./, ''); } catch (_) {}
  const source = meta(['og:site_name', 'twitter:site', 'application-name', 'author']).replace(/^@/, '') || host;
  let title = meta(['og:title', 'twitter:title', 'title']);
  if (!title) { const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (t) title = dec(t[1]); }
  // 제목 끝에 붙은 '- 언론사' · '| 언론사' 떼기
  if (source) for (const sep of [' - ', ' | ', ' :: ', ' – ', ' — ']) { if (title.endsWith(sep + source)) title = title.slice(0, -(sep + source).length).trim(); }
  let dateRaw = meta(['article:published_time', 'og:article:published_time', 'og:regDate', 'datePublished', 'date', 'pubdate', 'publish-date', 'article:modified_time']);
  if (!dateRaw) { const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/i); if (m) dateRaw = m[1]; }
  let published = '';
  const ymd = (y: number, mo: number, d: number) => (y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ? y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0') : '';
  if (dateRaw) {
    const m = /(\d{4})\D?(\d{1,2})\D?(\d{1,2})/.exec(dateRaw);
    if (m) published = ymd(+m[1], +m[2], +m[3]);
  }
  if (!published) {   // 본문의 '입력 2024.03.01' · '2024-03-01' · '2024년 3월 1일'
    const m2 = html.match(/(?:입력|등록|기사입력|승인|발행)[^0-9]{0,20}(20\d{2})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/) || html.match(/(20[0-3]\d)[.\-\/](\d{1,2})[.\-\/](\d{1,2})/) || html.match(/(20[0-3]\d)년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (m2) published = ymd(+m2[1], +m2[2], +m2[3]);
  }
  let image = meta(['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'image']);
  if (!image) { const lm = html.match(/<link[^>]+rel=["']image_src["'][^>]*>/i); if (lm) { const c = lm[0].match(/href=["']([^"']+)["']/i); if (c) image = c[1]; } }
  if (!image) {   // 본문 첫 사진 (아이콘 · 로고 · 배너 제외)
    for (const tag of html.match(/<img[^>]+>/ig) || []) {
      const c = tag.match(/(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/i); if (!c) continue;
      const s = c[1];
      if (!s || /^data:/i.test(s) || /(sprite|icon|logo|blank|pixel|1x1|spacer|avatar|profile|btn_|button|emoticon|loading|share|sns_|badge|favicon|banner|ad_|\/ads?\/)/i.test(s)) continue;
      image = s; break;
    }
  }
  if (image) { try { image = new URL(image, pageUrl).href; } catch (_) { image = ''; } }
  if (!/^https?:\/\//i.test(image)) image = '';
  const summary = meta(['og:description', 'twitter:description', 'description']).slice(0, 300);
  return { title: title.slice(0, 200), source: source.slice(0, 80), published, summary, image };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'POST 만 받습니다.' });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const URL_ = Deno.env.get('SUPABASE_URL') || '', key = anonKey();
  if (!token || !URL_ || !key) return reply(req, 401, { error: '로그인이 필요합니다.' });
  const auth = { apikey: key, Authorization: 'Bearer ' + token };
  // 1) 임원인지 확인
  try {
    const pr = await fetch(URL_ + '/rest/v1/rpc/my_perms', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' });
    const p: any = pr.ok ? await pr.json() : null;
    if (!p || !p.officer) return reply(req, 403, { error: '임원만 쓸 수 있습니다.' });
  } catch (_) { return reply(req, 401, { error: '로그인을 확인하지 못했습니다.' }); }
  let target = '';
  try { target = String((await req.json()).url || '').trim(); } catch (_) {}
  if (!/^https?:\/\/[^\s]+$/i.test(target) || target.length > 1000) return reply(req, 400, { error: '기사 주소(https://…)를 확인해 주세요.' });

  // 2) 기사 페이지 읽기
  let res: Response;
  try { res = await fetch(target, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(12000) }); }
  catch (_) { return reply(req, 502, { error: '기사 페이지를 열지 못했습니다. 제목 · 언론사 · 날짜를 직접 적고 사진을 끌어다 놓아 주세요.' }); }
  if (!res.ok) return reply(req, 502, { error: '기사 페이지가 응답하지 않습니다(' + res.status + '). 제목 · 언론사 · 날짜를 직접 적고 사진을 끌어다 놓아 주세요.' });
  const buf = new Uint8Array(await res.arrayBuffer()).subarray(0, 1500000);
  const m = parseMeta(readHtml(buf, res.headers.get('content-type') || ''), res.url || target);

  // 3) 대표 사진을 사진 저장소로 (그 임원의 권한으로) — 안 되면 사진 주소만
  let image_path = '', image_url = m.image;
  if (m.image) {
    try {
      const ir = await fetch(m.image, { headers: { 'User-Agent': UA, 'Referer': target, 'Accept': 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
      const ct = (ir.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const ext = ({ 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[ct];
      if (ir.ok && ext) {
        const img = new Uint8Array(await ir.arrayBuffer());
        if (img.byteLength > 1500 && img.byteLength <= 10 * 1024 * 1024) {
          const path = 'press/' + crypto.randomUUID() + '.' + ext;
          const up = await fetch(URL_ + '/storage/v1/object/' + BUCKET + '/' + path, { method: 'POST', headers: { ...auth, 'Content-Type': ct === 'image/jpg' ? 'image/jpeg' : ct, 'x-upsert': 'false' }, body: img });
          if (up.ok) { image_path = path; image_url = ''; }
        }
      }
    } catch (_) {}
  }
  return reply(req, 200, { url: target, title: m.title, source: m.source, published: m.published, summary: m.summary, image_path, image_url });
}

Deno.serve(handler);
