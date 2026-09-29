// ============================================================
//  제휴 단체(삼괴연합회) '회원 연동'
//  - 이 브라우저에 제휴 단체 로그인이 살아 있으면 비밀번호 없이 그 회원 정보를 확인
//  - 아니면 제휴 단체 이메일·비밀번호로 한 번 확인 → 정보만 가져오고 확인용 세션은 바로 종료
//  - 가져오는 항목: 이름·이메일·연락처·소속 (+ 제휴 단체 회원 ID: 연동 표시용)
//  ※ 만세운동본부 계정과 비밀번호는 따로입니다. 연동은 정보 가져오기 + 연동 기록입니다.
// ============================================================
(function () {
  var URL_ = window.SAMGOE_SUPABASE_URL, KEY = window.SAMGOE_SUPABASE_KEY;
  function sdk() { return window.supabase && window.supabase.createClient; }

  // 제휴 단체 사이트가 쓰는 저장 방식과 동일하게 읽음 (로그인 유지 여부에 따라 local/session)
  function samgoeStorage() {
    function on() { try { return localStorage.getItem('sam_remember') !== '0'; } catch (_) { return true; } }
    return {
      getItem: function (k) { try { return (on() ? localStorage : sessionStorage).getItem(k); } catch (_) { return null; } },
      setItem: function (k, v) { try { (on() ? localStorage : sessionStorage).setItem(k, v); } catch (_) {} },
      removeItem: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (_) {} }
    };
  }
  function memoryStorage() {
    var m = {};
    return { getItem: function (k) { return m[k] || null; }, setItem: function (k, v) { m[k] = v; }, removeItem: function (k) { delete m[k]; } };
  }
  async function readProfile(client, user) {
    var p = null;
    try { var r = await client.from('profiles').select('name,phone,church,email').eq('id', user.id).maybeSingle(); p = r.data || null; } catch (_) {}
    return {
      uid: user.id,
      email: (p && p.email) || user.email || '',
      name: (p && p.name) || (user.user_metadata && user.user_metadata.name) || '',
      phone: (p && p.phone) || '',
      church: (p && p.church) || ''
    };
  }

  // 1) 이 브라우저의 제휴 단체 로그인 확인 (없으면 null)
  async function fromSession() {
    if (!sdk() || !URL_ || !KEY) return null;
    try {
      var c = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: samgoeStorage() } });
      var s = await c.auth.getSession();
      var u = s.data && s.data.session ? s.data.session.user : null;
      if (!u) return null;
      return await readProfile(c, u);
    } catch (_) { return null; }
  }

  // 2) 제휴 단체 이메일·비밀번호로 확인 (확인 후 그 세션만 종료 — 제휴 단체 사이트 로그인 상태에는 영향 없음)
  async function withPassword(email, password) {
    if (!sdk() || !URL_ || !KEY) throw new Error('제휴 단체 연결 설정이 없습니다.');
    var c = window.supabase.createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storage: memoryStorage() } });
    var r = await c.auth.signInWithPassword({ email: email, password: password });
    if (r.error) {
      if (/Invalid login credentials/i.test(r.error.message)) throw new Error('삼괴연합회 이메일 또는 비밀번호가 올바르지 않습니다.');
      throw r.error;
    }
    var info = await readProfile(c, r.data.user);
    try { await c.auth.signOut({ scope: 'local' }); } catch (_) {}
    return info;
  }

  window.samgoeLink = { fromSession: fromSession, withPassword: withPassword };
})();
