// ============================================================
//  manse-signup — 삼일만세운동본부 회원가입 (만세운동본부 Supabase 프로젝트의 Edge Function)
//  Supabase 기본 메일은 운영진(팀) 주소로만 보내져 회원에게 '가입 확인 메일'을 보낼 수 없음
//  → 메일 없이 계정을 바로 만들고(email_confirm) 브라우저가 이어서 이메일 · 비밀번호로 로그인 (signup.html)
//  · 회원 정보(이름 · 연락처 · 소속 · 약관 동의)는 handle_new_user 가 만듦 — 예전 signUp 과 같음
//  · 한꺼번에 많이 만들지 못하게 10분에 20명까지 (manse-setup.sql 의 manse_signup_recent)
//  · 관리자 키는 이 함수 안에서만 쓰고 브라우저로 나가지 않음
//  · 배포: verify_jwt = false (가입 전이라 로그인 표가 없음)
// ============================================================
const ORIGINS = ['https://samgoe-cc.or.kr', 'https://www.samgoe-cc.or.kr', 'https://kds08200820-del.github.io', 'http://localhost:9000'];
const LIMIT = 20, WINDOW_MIN = 10;

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
// 이 프로젝트의 관리자 키 — 옛 방식(service_role JWT)이 있으면 그것, 없으면 새 비밀 키 (samgoe-login 과 같음)
function serviceKey(): string {
  const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (k) return k;
  try { const s: Record<string, string> = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); return s.default || Object.values(s)[0] || ''; } catch (_) { return ''; }
}
function adminHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;   // 새 비밀 키(sb_secret_)는 apikey 로만
  return h;
}
const cut = (v: unknown, n: number) => String(v == null ? '' : v).trim().slice(0, n);

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'POST 만 받습니다.' });
  let b: any = {};
  try { b = await req.json(); } catch (_) {}
  const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  if (!name || name.length > 40) return reply(req, 400, { error: '이름을 입력해 주세요. (40자까지)' });
  if (email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(req, 400, { error: '올바른 이메일을 입력해 주세요.' });
  if (pw.length < 8 || pw.length > 72) return reply(req, 400, { error: '비밀번호는 8자 이상이어야 합니다.' });
  if (b.terms !== true) return reply(req, 400, { error: '이용약관과 개인정보처리방침에 동의해 주세요.' });

  const URL_ = Deno.env.get('SUPABASE_URL') || '', key = serviceKey();
  if (!URL_ || !key) return reply(req, 500, { error: '서버 설정이 없습니다.' });
  const ah = adminHeaders(key);

  // 한꺼번에 많이 가입하지 못하게 (함수가 아직 없으면 그냥 넘어감)
  try {
    const rr = await fetch(URL_ + '/rest/v1/rpc/manse_signup_recent', { method: 'POST', headers: ah, body: JSON.stringify({ p_minutes: WINDOW_MIN }) });
    if (rr.ok && Number(await rr.json()) >= LIMIT) return reply(req, 429, { error: '지금 가입이 몰려 잠시 멈췄습니다. 10분 뒤에 다시 시도해 주세요.' });
  } catch (_) {}

  const meta = { name, phone: cut(b.phone, 30), church: cut(b.church, 60), terms_agreed_at: new Date().toISOString(), via: 'signup' };
  const cr = await fetch(URL_ + '/auth/v1/admin/users', { method: 'POST', headers: ah, body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: meta }) });
  if (!cr.ok) {
    const e: any = await cr.json().catch(() => ({}));
    const t = (e.error_code || e.code || '') + ' ' + (e.msg || e.message || '');
    if (/email_exists|already|registered/i.test(t)) return reply(req, 409, { error: '이미 가입된 이메일입니다. 로그인해 주세요. (삼괴연합회 회원이면 \'삼괴연합회 계정으로 로그인\'도 됩니다)' });
    if (/weak_password|password/i.test(t)) return reply(req, 400, { error: '쓸 수 없는 비밀번호입니다. 더 길고 다른 비밀번호를 넣어 주세요.' });
    if (/email/i.test(t)) return reply(req, 400, { error: '올바른 이메일을 입력해 주세요.' });
    return reply(req, 500, { error: '회원가입을 하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  return reply(req, 200, { ok: true });
}

Deno.serve(handler);
