// ============================================================
//  samgoe-login — 삼기연(삼괴연합회) 로그인으로 삼일만세운동본부에 로그인 (만세운동본부 Supabase 프로젝트의 Edge Function)
//  1) 브라우저가 보낸 삼기연 로그인 표(access token)를 삼기연 서버에 물어 진짜인지 확인
//  2) 만세운동본부 계정이 없으면 삼기연 정보(이름 · 연락처 · 소속)로 만들고, 있으면 그대로
//  3) 한 번만 쓰는 로그인 표(token_hash)를 돌려줌 → 브라우저가 verifyOtp 로 만세운동본부 세션을 받음 (메일은 보내지 않음)
//  · 관리자 키는 이 함수 안에서만 쓰고 브라우저로 나가지 않음 · 비밀번호는 다루지 않음
//  · 배포: verify_jwt = false (만세운동본부에 아직 로그인 전이므로 — 대신 삼기연 로그인 표를 직접 확인)
// ============================================================
const SAMGOE_URL = 'https://xurdgazbcoxjaqkvlqff.supabase.co';
const SAMGOE_KEY = 'sb_publishable_nBJeoClbq0p5Z62_YQx3hg_0Ahhlw_v';   // 삼기연 공개 키 (홈페이지에도 있는 값)
const ORIGINS = ['https://samgoe-cc.or.kr', 'https://www.samgoe-cc.or.kr', 'https://kds08200820-del.github.io', 'http://localhost:9000'];

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
// 이 프로젝트의 관리자 키 — 옛 방식(service_role JWT)이 있으면 그것, 없으면 새 비밀 키
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

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'POST 만 받습니다.' });
  let token = '';
  try { token = String((await req.json()).token || ''); } catch (_) {}
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return reply(req, 400, { error: '삼괴연합회 로그인 정보가 없습니다.' });

  // 1) 삼기연 로그인 확인
  const sg: Record<string, string> = { apikey: SAMGOE_KEY, Authorization: 'Bearer ' + token };
  const ur = await fetch(SAMGOE_URL + '/auth/v1/user', { headers: sg });
  if (!ur.ok) return reply(req, 401, { error: '삼괴연합회 로그인이 끝났습니다. 삼괴연합회 홈페이지에서 다시 로그인해 주세요.' });
  const su: any = await ur.json();
  const email = String(su.email || '').trim().toLowerCase();
  if (!su.id || !email || email.endsWith('@deleted.invalid')) return reply(req, 403, { error: '사용할 수 없는 삼괴연합회 계정입니다.' });
  let prof: any = {};
  try {
    const pr = await fetch(SAMGOE_URL + '/rest/v1/profiles?select=name,phone,church,deleted_at,suspended_at&id=eq.' + su.id, { headers: sg });
    if (pr.ok) prof = (await pr.json())[0] || {};
  } catch (_) {}
  if (prof.deleted_at || prof.suspended_at) return reply(req, 403, { error: '사용할 수 없는 삼괴연합회 계정입니다.' });

  // 2) 만세운동본부 계정 (없으면 만들기 — 가입 시 회원 정보는 handle_new_user 가 만듦)
  const URL_ = Deno.env.get('SUPABASE_URL') || '', key = serviceKey();
  if (!URL_ || !key) return reply(req, 500, { error: '서버 설정이 없습니다.' });
  const ah = adminHeaders(key);
  const meta = { name: prof.name || (su.user_metadata && su.user_metadata.name) || '', phone: prof.phone || '', church: prof.church || '',
                 terms_agreed_at: new Date().toISOString(), samgoe_uid: su.id, samgoe_email: email, via: 'samgoe' };
  const cr = await fetch(URL_ + '/auth/v1/admin/users', { method: 'POST', headers: ah, body: JSON.stringify({ email, email_confirm: true, user_metadata: meta }) });
  let created = cr.ok;
  if (!cr.ok) {
    const e: any = await cr.json().catch(() => ({}));
    if (!/email_exists|already|registered|exists/i.test((e.error_code || e.code || '') + ' ' + (e.msg || e.message || ''))) {
      return reply(req, 500, { error: '만세운동본부 계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  }

  // 3) 한 번만 쓰는 로그인 표 (메일은 보내지 않음)
  const lr = await fetch(URL_ + '/auth/v1/admin/generate_link', { method: 'POST', headers: ah, body: JSON.stringify({ type: 'magiclink', email }) });
  const lk: any = await lr.json().catch(() => ({}));
  if (!lr.ok || !lk.hashed_token) return reply(req, 500, { error: '로그인을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.' });

  // 이미 있던 만세운동본부 계정이면 삼기연 연동 표시 (처음 연동일 때만)
  if (!created && lk.id) {
    try {
      await fetch(URL_ + '/rest/v1/profiles?id=eq.' + lk.id + '&samgoe_uid=is.null', { method: 'PATCH', headers: { ...ah, Prefer: 'return=minimal' },
        body: JSON.stringify({ samgoe_uid: su.id, samgoe_email: email, samgoe_linked_at: new Date().toISOString() }) });
    } catch (_) {}
  }
  return reply(req, 200, { token_hash: lk.hashed_token, email, created });
}

Deno.serve(handler);
