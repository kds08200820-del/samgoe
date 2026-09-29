// ============================================================
//  삼일만세운동본부 — 공통 인증 (만세운동본부 전용 Supabase 프로젝트)
//  로드 순서: supabase CDN → manse/config.js → manse/auth.js
//  - window.msb : 만세운동본부 Supabase client (설정 전이면 null → 게스트 모드)
//  - #mAuth 요소에 로그인 상태 메뉴 표시
//  - mErr / mUser / mProfile / mPerms / mRequireLogin / mRequireOfficer 제공
//  ※ 다른 사이트의 로그인과 세션·계정이 완전히 분리됩니다.
// ============================================================
(function () {
  var host = location.hostname;
  if (location.protocol === 'http:' && host !== 'localhost' && host !== '127.0.0.1') {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    return;
  }

  // 이 스크립트가 있는 manse/ 폴더 기준 주소
  var me = document.currentScript;
  var BASE = new URL('.', me ? me.src : location.href).href;
  window.MANSE_BASE = BASE;
  window.mUrl = function (p) { return new URL(p, BASE).href; };
  window.MANSE_HOME = BASE;

  // 제휴 단체 페이지에서 넘어온 방문인지 기록(가입 시 '연동하기' 안내용)
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('from') === 'samgoe') sessionStorage.setItem('manse_from_samgoe', '1');
    if (document.referrer) {
      var r = new URL(document.referrer);
      if (r.origin === location.origin && !/^\/(manse\/|march\.html)/.test(r.pathname)) sessionStorage.setItem('manse_from_samgoe', '1');
    }
  } catch (_) {}
  window.mFromSamgoe = function () { try { return sessionStorage.getItem('manse_from_samgoe') === '1'; } catch (_) { return false; } };

  // 로그인 유지(자동 로그인) — 해제하면 브라우저를 닫을 때 로그아웃
  function rememberOn() { try { return localStorage.getItem('manse_remember') !== '0'; } catch (_) { return true; } }
  window.mSetRemember = function (on) { try { localStorage.setItem('manse_remember', on ? '1' : '0'); } catch (_) {} };
  var storage = {
    getItem: function (k) { try { return (rememberOn() ? localStorage : sessionStorage).getItem(k); } catch (_) { return null; } },
    setItem: function (k, v) { try { (rememberOn() ? localStorage : sessionStorage).setItem(k, v); } catch (_) {} },
    removeItem: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (_) {} }
  };

  var URL_ = window.MANSE_SUPABASE_URL, KEY = window.MANSE_SUPABASE_KEY;
  var ready = !!(window.supabase && window.supabase.createClient && URL_ && KEY);
  window.msb = ready
    ? window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, storage: storage, storageKey: 'manse-auth' } })
    : null;
  window.MANSE_READY = ready;

  // Supabase 오류 → 한국어 안내
  window.mErr = function (e) {
    var m = String((e && e.message) || e || '');
    if (/banned|user is banned/i.test(m)) return '이용약관 위반으로 계정이 정지되었습니다. 문의: ' + (window.MANSE_CONTACT || '운영자');
    if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 완료되지 않았습니다. 가입 확인 메일의 링크를 눌러 주세요.';
    if (/already registered|already been registered|User already/i.test(m)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
    if (/New password should be different|same password|different from the old/i.test(m)) return '이전과 다른 비밀번호를 입력해 주세요.';
    if (/Password should be at least|password.*(short|requirement|contain)/i.test(m)) return '비밀번호는 8자 이상이어야 합니다.';
    if (/valid email|Unable to validate email|invalid.*email/i.test(m)) return '올바른 이메일 형식이 아닙니다.';
    if (/For security purposes|after \d+ second/i.test(m)) return '보안을 위해 잠시 후 다시 시도해 주세요.';
    if (/rate limit|too many/i.test(m)) return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
    if (/could not find the function|does not exist/i.test(m)) return 'DB 설정이 아직 완료되지 않았습니다. 관리자가 설정 SQL(manse-setup.sql)을 SQL Editor에서 실행해 주세요.';
    if (/row-level security|permission denied|not allowed/i.test(m)) return '권한이 없습니다.';
    if (/network|fetch/i.test(m)) return '네트워크 오류입니다. 연결 상태를 확인해 주세요.';
    return m || '알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.';
  };

  window.mUser = async function () {
    if (!window.msb) return null;
    try { var s = await window.msb.auth.getSession(); return (s.data && s.data.session) ? s.data.session.user : null; }
    catch (_) { return null; }
  };
  window.mProfile = async function () {
    var u = await window.mUser(); if (!u) return null;
    try { var r = await window.msb.from('profiles').select('*').eq('id', u.id).maybeSingle(); return r.data || null; }
    catch (_) { return null; }
  };
  var permCache = null;
  window.mPerms = async function (fresh) {
    if (permCache && !fresh) return permCache;
    var none = { admin: false, officer: false, manager: false, role: null };
    if (!window.msb) return none;
    try {
      var r = await window.msb.rpc('my_perms');
      permCache = (r && !r.error && r.data) ? r.data : none;
    } catch (_) { permCache = none; }
    return permCache;
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  window.mEsc = esc;

  // 상단 메뉴 렌더링 — 페이지에 <span id="mAuth"></span> 이 있으면 채움
  function render(user, profile, perms) {
    var el = document.getElementById('mAuth'); if (!el) return;
    var sep = '<span class="m-sep">|</span>';
    if (!user) {
      el.innerHTML = '<a href="' + window.mUrl('login.html') + '">로그인</a>' + sep + '<a href="' + window.mUrl('signup.html') + '">회원가입</a>';
      return;
    }
    var parts = [];
    var nm = (profile && profile.name) || (user.email || '').split('@')[0];
    parts.push('<span class="m-me">' + esc(nm) + '님</span>');
    if (perms && perms.officer) parts.push('<a class="m-officer" href="' + window.mUrl('officer.html') + '">임원방</a>');
    parts.push('<a href="' + window.mUrl('mypage.html') + '">내 정보</a>');
    parts.push('<a href="#" data-m-logout>로그아웃</a>');
    el.innerHTML = parts.join(sep);
    var lo = el.querySelector('[data-m-logout]');
    if (lo) lo.addEventListener('click', async function (e) {
      e.preventDefault();
      try { await window.msb.auth.signOut(); } catch (_) {}
      location.href = window.MANSE_HOME;
    });
  }
  render(null);
  async function refresh() {
    var u = await window.mUser();
    if (!u) { render(null); return; }
    var p = await window.mProfile(); var perms = await window.mPerms(true);
    render(u, p, perms);
    document.dispatchEvent(new CustomEvent('manse:auth', { detail: { user: u, profile: p, perms: perms } }));
  }
  if (ready) { refresh(); window.msb.auth.onAuthStateChange(function (ev) { if (ev !== 'TOKEN_REFRESHED') refresh(); }); }

  // 만세운동본부 앱(설치형 웹앱) — /manse/ 전용 서비스워커
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register(new URL('sw.js', BASE).href, { scope: BASE }).catch(function () {}); });
  }

  // 보호 페이지 가드
  window.mRequireLogin = async function () {
    if (!window.msb) { alert('로그인 기능이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.'); location.href = window.MANSE_HOME; return null; }
    var u = await window.mUser();
    if (!u) { location.href = window.mUrl('login.html') + '?next=' + encodeURIComponent(location.pathname + location.search); return null; }
    return u;
  };
  window.mRequireOfficer = async function () {
    var u = await window.mRequireLogin(); if (!u) return null;
    var perms = await window.mPerms(true);
    if (!perms.officer) return { user: u, perms: perms, denied: true };
    return { user: u, perms: perms };
  };
})();
