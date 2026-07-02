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

  // Anon Key가 아직 비어 있으면 client를 만들지 않고 게스트 모드로 동작 (사이트는 정상)
  window.sb = ready
    ? window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

  // Supabase 영문 에러 메시지를 한국어로 변환
  window.krErr = function (m) {
    m = String(m || '');
    if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 필요합니다. 가입 시 받은 인증 메일을 확인해 주세요.';
    if (/already registered|already been registered|User already/i.test(m)) return '이미 가입된 이메일입니다.';
    if (/Password should be at least/i.test(m)) return '비밀번호는 6자 이상이어야 합니다.';
    if (/valid email|Unable to validate email|invalid.*email/i.test(m)) return '올바른 이메일 형식이 아닙니다.';
    if (/rate limit|too many requests/i.test(m)) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    if (/network|fetch/i.test(m)) return '네트워크 오류입니다. 연결 상태를 확인해 주세요.';
    return m || '알 수 없는 오류가 발생했습니다.';
  };

  // 관리자 이메일 목록 (여기에 추가하면 관리자 권한 부여)
  window.ADMIN_EMAILS = ['kds08200820@gmail.com'];
  window.isAdmin = function (user) {
    return !!(user && user.email && window.ADMIN_EMAILS.indexOf(String(user.email).toLowerCase()) >= 0);
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
    if (user) {
      var sep = '<span style="color:rgba(255,255,255,0.35);margin:0 8px">|</span>';
      var parts = [];
      if (window.isAdmin(user)) parts.push('<a href="admin.html" style="color:#8fc0ff;font-weight:700">관리자</a>');
      if (profile && profile.officer_role) parts.push('<a href="officer.html" style="color:#8fc0ff;font-weight:700">임원실</a>');
      parts.push('<a href="mypage.html" style="color:rgba(255,255,255,0.9)">마이페이지</a>');
      parts.push('<a href="#" id="logoutBtn" style="color:rgba(255,255,255,0.9)">로그아웃</a>');
      el.innerHTML = parts.join(sep);
      var lo = document.getElementById('logoutBtn');
      if (lo) lo.addEventListener('click', async function (e) {
        e.preventDefault();
        if (window.sb) { try { await window.sb.auth.signOut(); } catch (_) {} }
        location.href = 'index.html';
      });
    } else {
      el.innerHTML = '<a href="login.html" style="color:rgba(255,255,255,0.9)">로그인</a>';
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
      location.href = 'login.html';
      return false;
    }
    return r.data.session.user;
  };

  // 관리자 전용 페이지 가드 — 로그인 + 관리자 이메일이어야 통과
  window.requireAdmin = async function () {
    var user = await window.requireAuth();
    if (!user) return false;
    if (!window.isAdmin(user)) {
      alert('관리자 전용 페이지입니다.');
      location.href = 'index.html';
      return false;
    }
    return user;
  };

  // 임원 직책 목록
  window.OFFICER_ROLES = ['회장', '부회장', '증경회장', '사무총장', '서기', '부서기', '회계', '실무위원'];

  // 임원 전용 페이지 가드 — 로그인 + 임원 직책이 지정되어 있어야 통과
  window.requireOfficer = async function () {
    var user = await window.requireAuth();
    if (!user) return false;
    var profile = await window.getMyProfile();
    if (!profile || !profile.officer_role) {
      alert('임원 전용 페이지입니다.');
      location.href = 'index.html';
      return false;
    }
    return { user: user, profile: profile };
  };
})();
