// ============================================================
//  삼기연 — 공통 인증 로직 (Supabase Auth)
//  로드 순서: supabase CDN → supabase-config.js → auth.js
//  - 상단 바의 #authArea 를 로그인 상태에 따라 갱신
//  - window.sb (Supabase client), window.krErr, window.requireAuth 제공
// ============================================================
(function () {
  // 보안: http로 접속하면 https로 자동 전환 (로그인 비밀번호 보호)
  if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    return;
  }
  var URL = window.SUPABASE_URL;
  var KEY = window.SUPABASE_ANON_KEY;
  var hasSDK = !!(window.supabase && window.supabase.createClient);
  var ready = hasSDK && URL && KEY;

  // "로그인 정보 저장(자동 로그인)" — 체크 시 localStorage(브라우저를 닫아도 유지),
  //   해제 시 sessionStorage(탭/브라우저를 닫으면 로그아웃)에 세션을 저장합니다.
  //   기본값은 '저장'(자동 로그인)입니다.
  function rememberOn() { try { return localStorage.getItem('sam_remember') !== '0'; } catch (_) { return true; } }
  var authStorage = {
    getItem: function (k) { try { return (rememberOn() ? window.localStorage : window.sessionStorage).getItem(k); } catch (_) { return null; } },
    setItem: function (k, v) { try { (rememberOn() ? window.localStorage : window.sessionStorage).setItem(k, v); } catch (_) {} },
    removeItem: function (k) { try { window.localStorage.removeItem(k); window.sessionStorage.removeItem(k); } catch (_) {} }
  };
  window.setRemember = function (on) { try { localStorage.setItem('sam_remember', on ? '1' : '0'); } catch (_) {} };

  // Anon Key가 아직 비어 있으면 client를 만들지 않고 게스트 모드로 동작 (사이트는 정상)
  window.sb = ready
    ? window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storage: authStorage } })
    : null;

  // Supabase 영문 에러 메시지를 한국어로 변환
  window.krErr = function (m) {
    m = String(m || '');
    if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 필요합니다. 가입 시 받은 인증 메일을 확인해 주세요.';
    if (/already registered|already been registered|User already|email address has already/i.test(m)) return '이미 가입된 이메일입니다.';
    if (/New password should be different|different from the old/i.test(m)) return '새 비밀번호는 기존 비밀번호와 달라야 합니다.';
    if (/Password should be at least|should contain|password.*requirement/i.test(m)) return '비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.';
    if (/banned|user is banned|account.*(disabled|deactivat)/i.test(m)) return '이용약관 위반으로 계정이 정지되었습니다. 문의는 관리자에게 연락해 주세요.';
    if (/valid email|Unable to validate email|invalid.*email/i.test(m)) return '올바른 이메일 형식이 아닙니다.';
    if (/For security purposes|after \d+ second/i.test(m)) return '보안을 위해 잠시 후 다시 시도해 주세요.';
    if (/rate limit|too many requests/i.test(m)) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    if (/network|fetch/i.test(m)) return '네트워크 오류입니다. 연결 상태를 확인해 주세요.';
    return m || '알 수 없는 오류가 발생했습니다.';
  };

  // 최고관리자 이메일 (회장 선정 등 최상위 권한 — 이 계정만 임원 직책을 지정할 수 있음)
  window.ADMIN_EMAILS = ['kds08200820@gmail.com'];
  window.isSuperAdmin = function (user) {
    return !!(user && user.email && window.ADMIN_EMAILS.indexOf(String(user.email).toLowerCase()) >= 0);
  };
  // 관리자 = 최고관리자(이메일) 또는 회장(officer_role='회장')
  //   최고관리자가 회장을 선정하면 회장도 관리자 권한(회원관리·갤러리 관리)을 갖습니다.
  window.isAdmin = function (user, profile) {
    if (window.isSuperAdmin(user)) return true;
    return !!(profile && profile.officer_role === '회장');
  };

  // 사모/사부(목회자 배우자) 여부 — 사모 게시판 접근용
  window.isSamo = function (user, profile) {
    if (window.isSuperAdmin(user)) return true;
    return !!(profile && (profile.member_kind === '사모' || profile.member_kind === '사부'));
  };

  // 관리자 콘솔 등급
  //  최고관리자(대표) = 이메일 / 일반관리자(상담원) = profile.admin_role === 'staff'
  window.isStaffAdmin = function (profile) { return !!(profile && profile.admin_role === 'staff'); };
  //  콘솔 접근 = 최고관리자(대표) 또는 회장 또는 일반관리자(staff). 그 외 접근 불가.
  window.isConsoleAdmin = function (user, profile) {
    return window.isSuperAdmin(user) || window.isStaffAdmin(profile) || !!(profile && profile.officer_role === '회장');
  };

  // 관리자 메뉴에 들어갈 수 있는 사람 = 임원 직책이 있거나, 최고관리자 · 회장 · 일반관리자(운영관리)
  window.canEnterOfficerRoom = function (user, profile) {
    return !!(user && (window.isSuperAdmin(user) || (profile && profile.officer_role) || window.isConsoleAdmin(user, profile)));
  };

  // 현재 로그인 사용자의 프로필(이름/교회/구분/직책) 조회
  window.getMyProfile = async function () {
    if (!window.sb) return null;
    try {
      var r = await window.sb.auth.getUser();
      var u = r.data && r.data.user;
      if (!u) return null;
      var p = await window.sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
      if (p.error) return null;
      return p.data || null;
    } catch (e) { return null; }
  };

  // 상단 바의 로그인/마이페이지 영역 렌더링 (profile로 관리자·임원 메뉴 결정)
  function renderAuth(user, profile) {
    var el = document.getElementById('authArea');
    if (!el) return;
    // 삼일만세운동본부(manse/auth.js)와 같은 짜임: 이름님 | 관리자 메뉴 | (문의 · 사모 게시판) | 내 정보 | 로그아웃
    var sep = '<span style="color:rgba(255,255,255,0.3);margin:0 8px">|</span>';
    var lk = function (href, text, extra) { return '<a href="' + href + '" style="color:rgba(255,255,255,0.9)' + (extra || '') + '">' + text + '</a>'; };
    if (user) {
      var parts = [];
      var nm = (profile && profile.name) || String(user.email || '').split('@')[0];
      parts.push('<span style="color:#fff;font-weight:600">' + String(nm).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }) + '님</span>');
      if (window.canEnterOfficerRoom(user, profile)) parts.push('<a href="officer.html" style="color:#e8c4a6;font-weight:700">관리자 메뉴</a>');
      parts.push(lk('inquiry.html', '문의'));
      if (window.isSamo(user, profile)) parts.push(lk('samo.html', '사모 게시판', ';font-weight:700'));
      parts.push(lk('mypage.html', '내 정보'));
      parts.push('<a href="#" id="logoutBtn" style="color:rgba(255,255,255,0.9)">로그아웃</a>');
      el.innerHTML = parts.join(sep);
      var lo = document.getElementById('logoutBtn');
      if (lo) lo.addEventListener('click', async function (e) {
        e.preventDefault();
        if (window.sb) { try { await window.sb.auth.signOut(); } catch (_) {} }
        location.href = 'index.html';
      });
    } else {
      // 관리자 메뉴 들어가는 곳은 로그인 옆 (맨 앞) — 누르면 로그인한 뒤 바로 관리자 메뉴로
      el.innerHTML = '<a href="login.html?next=officer.html" style="color:#e8c4a6;font-weight:700">관리자 메뉴</a>' + sep + lk('login.html', '로그인') + sep + lk('signup.html', '회원가입');
    }
  }
  window.renderAuth = renderAuth;

  // 항상 먼저 '로그인'(게스트)으로 즉시 표시 — Supabase 응답 전/실패해도 링크가 보이도록
  renderAuth(null);

  async function refreshNav() {
    try {
      var s = await window.sb.auth.getSession();
      var user = s.data && s.data.session ? s.data.session.user : null;
      if (!user) { renderAuth(null); return; }
      var profile = await window.getMyProfile();
      renderAuth(user, profile);
    } catch (e) { renderAuth(null); }
  }
  if (ready) {
    refreshNav();
    window.sb.auth.onAuthStateChange(function () { refreshNav(); });
  }

  // 보호 페이지용 가드 — 로그인 안 했으면 로그인 페이지로 강제 이동
  window.requireAuth = async function () {
    if (!window.sb) {
      alert('로그인 기능이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.');
      location.href = 'index.html';
      return false;
    }
    var r = await window.sb.auth.getSession();
    if (!r.data.session) {
      alert('로그인이 필요한 서비스입니다.');
      // 로그인한 뒤 이 화면으로 돌아오도록
      var here = (location.pathname.split('/').pop() || 'index.html') + location.search + location.hash;
      location.href = 'login.html?next=' + encodeURIComponent(here);
      return false;
    }
    return r.data.session.user;
  };

  // 관리자 전용 페이지 가드 — 로그인 + (최고관리자 또는 회장)이어야 통과
  window.requireAdmin = async function () {
    var user = await window.requireAuth();
    if (!user) return false;
    var profile = await window.getMyProfile();
    if (!window.isAdmin(user, profile)) {
      alert('관리자 전용 페이지입니다.');
      location.href = 'index.html';
      return false;
    }
    return user;
  };

  // 최고관리자 전용 페이지 가드 — 로그인 + 최고관리자(이메일)여야 통과
  window.requireSuperAdmin = async function () {
    var user = await window.requireAuth();
    if (!user) return false;
    if (!window.isSuperAdmin(user)) {
      alert('최고관리자 전용 페이지입니다.');
      location.href = 'index.html';
      return false;
    }
    return user;
  };

  // 관리자 콘솔 가드 — 로그인 + (최고관리자 또는 일반관리자)여야 통과. profile 반환.
  window.requireConsoleAdmin = async function () {
    var user = await window.requireAuth();
    if (!user) return false;
    var profile = await window.getMyProfile();
    if (!window.isConsoleAdmin(user, profile)) {
      alert('관리자 전용 페이지입니다.');
      location.href = 'index.html';
      return false;
    }
    return { user: user, profile: profile || {}, isSuper: window.isSuperAdmin(user) };
  };

  // 임원 직책 목록
  window.OFFICER_ROLES = ['회장', '부회장', '증경회장', '사무총장', '부사무총장', '서기', '부서기', '회계', '실무위원'];

  // 임원 전용 페이지 가드 — 로그인 + 임원 직책이 지정되어 있어야 통과
  window.requireOfficer = async function () {
    var user = await window.requireAuth();
    if (!user) return false;
    var profile = await window.getMyProfile();
    var allowed = (profile && profile.officer_role) || window.isSuperAdmin(user);
    if (!allowed) {
      alert('임원만 이용할 수 있습니다.');
      location.href = 'index.html';
      return false;
    }
    return { user: user, profile: profile || {} };
  };

  // 관리자 메뉴 가드 — 임원 + 관리자 · 운영관리 담당자까지. officer: 임원 자료(문서 · 회의)를 볼 수 있는지
  window.requireOfficerRoom = async function () {
    var user = await window.requireAuth();
    if (!user) return false;
    var profile = await window.getMyProfile();
    if (!window.canEnterOfficerRoom(user, profile)) {
      alert('임원만 이용할 수 있습니다.');
      location.href = 'index.html';
      return false;
    }
    return { user: user, profile: profile || {}, officer: window.isSuperAdmin(user) || !!(profile && profile.officer_role) };
  };

  // 사모 게시판 전용 가드 — 로그인 + 사모/사부(또는 최고관리자)여야 통과
  window.requireSamo = async function () {
    var user = await window.requireAuth();
    if (!user) return false;
    var profile = await window.getMyProfile();
    if (!window.isSamo(user, profile)) {
      alert('사모·사부(목회자 배우자) 전용 게시판입니다.');
      location.href = 'index.html';
      return false;
    }
    return { user: user, profile: profile || {} };
  };
})();
