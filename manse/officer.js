// ============================================================
//  삼일만세운동본부 관리자 메뉴 — 공문·자료 아카이브 / 임원 명단 / 회원 관리 / 자료 올리기
//  권한은 서버(RLS)가 최종 판단합니다. 화면 숨김은 편의일 뿐입니다.
// ============================================================
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.mEsc;
  var BUCKET = 'manse-docs';
  var CATS = ['공문(발신)', '공문(수신)', '공고·고시', '공모·협약·보조금', '회의록', '계획·보고', '행사 운영',
              '홍보·언론', '교회 연합 활동', '행정·대관', '회계·예산', '단체 기본', '명부·개인정보', '기타'];
  var CAT_CODE = { '공문(발신)': 'out', '공문(수신)': 'in', '공고·고시': 'notice', '공모·협약·보조금': 'grant', '회의록': 'minutes',
                   '계획·보고': 'report', '행사 운영': 'event', '홍보·언론': 'press', '교회 연합 활동': 'church', '행정·대관': 'admin', '회계·예산': 'finance',
                   '단체 기본': 'org', '명부·개인정보': 'people', '기타': 'etc' };
  var ROLES = ['대표회장', '상임부회장', '부회장', '총무', '부총무', '서기', '부서기', '회계', '부회계', '감사', '고문', '전문위원'];
  var MIME = { pdf: 'application/pdf', hwp: 'application/x-hwp', hwpx: 'application/haansofthwpx', jpg: 'image/jpeg', jpeg: 'image/jpeg',
               png: 'image/png', webp: 'image/webp', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain', zip: 'application/zip' };

  var me = null, perms = null, profile = null;
  var DOCS = [], ALLDOCS = [], OFFICERS = [], MEMBERS = [];   // DOCS: 공문 · 자료(filed), ALLDOCS: 바구니 분류 대기까지
  var state = { biz: '', cat: '', year: '', q: '' };   // biz: '' 전체 · 'gen' 본부 일반 · 'walk' 걷기 전체 · 'w6' 제6회
  var WALK_BASE = 2020;   // 제N회 3·1 만세길 걷기 = (2020 + N)년 — 제6회 2026
  function walkLabel(n) { return '제' + n + '회 3·1 만세길 걷기'; }
  function walkNos() {     // 고를 수 있는 회차: 올해 다음 회차까지 + 이미 자료에 있는 회차
    var top = new Date().getFullYear() - WALK_BASE + 1, set = {};
    for (var i = 1; i <= top; i++) set[i] = 1;
    DOCS.forEach(function (d) { if (d.walk_no) set[d.walk_no] = 1; });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }
  function walkOptions(sel) {
    return '<option value="">본부 일반 자료 (걷기 외)</option>' + walkNos().map(function (n) {
      return '<option value="' + n + '"' + (String(sel) === String(n) ? ' selected' : '') + '>' + walkLabel(n) + ' (' + (WALK_BASE + n) + ')</option>'; }).join('');
  }

  function note(el, cls, t) { el.className = 'm-msg ' + cls; el.textContent = t; }
  function extOf(name) { var m = /\.([A-Za-z0-9]{1,6})$/.exec(name || ''); return m ? m[1].toLowerCase() : 'bin'; }
  function uid() { try { return crypto.randomUUID(); } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); } }
  function keyFor(year, cat, name, sens) { return (sens ? 'private/' : '') + year + '/' + (CAT_CODE[cat] || 'etc') + '/' + uid() + '.' + extOf(name); }
  function toDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null; }
  function fmtSize(n) { if (!n) return ''; return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }

  // ---------------- 시작 ----------------
  (async function init() {
    var r = await window.mRequireOfficer();
    if (!r) return;
    me = r.user; perms = r.perms;
    if (r.denied) {
      $('gateMsg').innerHTML = '임원 명단에 등록된 임원만 이용할 수 있습니다.<br>대표회장 또는 서기에게 <b>' + esc(me.email) +
        '</b> (가입 이메일)을 임원 명단에 넣어 달라고 요청해 주세요.<br><br><a class="m-btn ghost sm" href="./">홈으로</a>';
      return;
    }
    profile = (await window.mProfile()) || {};
    $('gate').hidden = true; $('app').hidden = false;
    $('meLine').textContent = (profile.name || me.email) + '님' + (perms.role ? ' · ' + perms.role : '') +
      (perms.admin ? ' · 최고관리자' : '') + (perms.manager ? ' · 운영임원(명단·회원 관리, 개인정보 자료 열람)' : '');
    document.querySelectorAll('[data-mgr]').forEach(function (el) { el.hidden = !perms.manager; });
    setupTabs(); setupDocs(); setupRoster(); setupUpload(); setupWalks();
    loadDocs(); loadRoster(); loadWalks(); if (perms.manager) loadMembers();
    // 걷기대회 총괄 — 관리 단추 · 회차별 결과 보고 (walk-report.js), 결과 보고 PDF는 공문 · 자료(행사 운영)로
    if (window.WalkReport) window.WalkReport.init({ me: me, profile: profile, perms: perms, putFile: putFile, insertDoc: insertDoc, reloadDocs: loadDocs });
    // 회계 — 삼기연과 따로인 만세운동본부 장부 (manse/ledger-setup.sql). 기록 · 고치기는 회계만, 다른 임원은 보기 · 인쇄만
    if (window.Ledger) window.Ledger.mount($('ledgerBox'), {
      client: window.msb, org: '삼일만세운동본부', setupFile: 'manse/ledger-setup.sql (만세운동본부 프로젝트)', setupPage: '../setup-sql.html',
      canWrite: !!(perms.officer && perms.role === '회계'),
      signers: ['회계', '감사', '대표회장'],
      cats: {
        '수입': ['회비', '후원금', '보조금', '찬조금', '행사 참가비', '이자', '기타 수입'],
        '지출': ['행사비', '기념사업비', '회의비', '식비 · 다과', '사무 · 통신비', '인쇄 · 홍보비', '차량 · 교통비', '경조사비', '기타 지출']
      }
    });
    $('bylawsBtn').addEventListener('click', openBylaws);
  })();

  function setupTabs() {
    document.querySelectorAll('.o-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.o-tab').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        document.querySelectorAll('.o-panel').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + t.dataset.tab); });
        try { history.replaceState(null, '', '#' + t.dataset.tab); } catch (_) {}
      });
    });
    var h = (location.hash || '').slice(1);
    var t = document.querySelector('.o-tab[data-tab="' + h + '"]'); if (t && !t.hidden) t.click();
  }

  // ---------------- 공문·자료 ----------------
  function setupDocs() {
    $('fCat').innerHTML = '<option value="">전체 분류</option>' + CATS.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    $('fBiz').addEventListener('change', function () { state.biz = this.value; renderDocs(); });
    $('fCat').addEventListener('change', function () { state.cat = this.value; renderDocs(); });
    $('fYear').addEventListener('change', function () { state.year = this.value; renderDocs(); });
    $('fText').addEventListener('input', function () { state.q = this.value.trim().toLowerCase(); renderDocs(); });
    $('fClear').addEventListener('click', function () {
      state.biz = state.cat = state.year = state.q = ''; $('fBiz').value = $('fCat').value = $('fYear').value = $('fText').value = ''; renderDocs();
    });
    $('docList').addEventListener('click', onDocAction);
    $('docModal').addEventListener('click', function (e) { if (e.target === this || e.target.hasAttribute('data-close')) this.classList.remove('on'); });
    $('docForm').addEventListener('submit', saveDocMeta);
    $('dCat').innerHTML = CATS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  }
  async function loadDocs() {
    var r = await window.msb.from('docs').select('*').order('year', { ascending: false }).order('doc_date', { ascending: false, nullsFirst: false }).order('date_text', { ascending: false });
    if (r.error) { $('docList').innerHTML = '<div class="o-empty">' + esc(window.mErr(r.error)) + '</div>'; return; }
    ALLDOCS = r.data || []; DOCS = ALLDOCS.filter(function (d) { return d.status !== 'pending'; });
    renderBasket();
    var years = Array.from(new Set(DOCS.map(function (d) { return d.year; }))).sort(function (a, b) { return b - a; });
    $('fYear').innerHTML = '<option value="">전체 연도</option>' + years.map(function (y) { return '<option value="' + y + '">' + y + '년</option>'; }).join('');
    if (state.year) $('fYear').value = state.year;
    var wn = Array.from(new Set(DOCS.filter(function (d) { return d.walk_no; }).map(function (d) { return d.walk_no; }))).sort(function (a, b) { return b - a; });
    var opt = function (v, l) { return '<option value="' + v + '" data-l="' + esc(l) + '">' + esc(l) + '</option>'; };
    $('fBiz').innerHTML = opt('', '전체 자료') + opt('gen', '본부 일반 자료') + opt('walk', '3·1 만세길 걷기 — 모든 회차') +
      wn.map(function (n) { return opt('w' + n, '　제' + n + '회 · ' + (WALK_BASE + n) + '년'); }).join('');
    if (state.biz && !$('fBiz').querySelector('option[value="' + state.biz + '"]')) state.biz = '';
    $('fBiz').value = state.biz;
    renderDocs();
  }
  function bizOf(d, b) { return !b || (b === 'gen' ? !d.walk_no : b === 'walk' ? !!d.walk_no : 'w' + d.walk_no === b); }
  // 공문 · 자료 표시 — 같은 분류끼리 한 상자
  function catGroups(items) {
    var html = '';
    CATS.concat(items.map(function (d) { return d.category; }).filter(function (c) { return CATS.indexOf(c) < 0; }))
      .filter(function (c, i, a) { return a.indexOf(c) === i; }).forEach(function (c) {
      var g = items.filter(function (d) { return d.category === c; });
      if (!g.length) return;
      html += '<div class="o-group"><h3><span>' + esc(c) + '</span><span style="color:var(--muted);font-weight:400">' + g.length + '</span></h3>';
      g.forEach(function (d) {
        var date = d.doc_date || d.date_text || '';
        html += '<div class="o-row"><div class="d">' + esc(date) + '</div><div class="t">' + esc(d.title) +
          (d.sensitive ? ' <span class="chip bad">개인정보</span>' : '') +
          '<small>' + [d.doc_no, d.note, d.uploader_name ? '올린 이: ' + d.uploader_name : '', fmtSize(d.size)].filter(Boolean).map(esc).join(' · ') + '</small></div>' +
          '<div class="a">' + (d.path ? '<button class="m-btn sm" data-act="view" data-id="' + d.id + '">열람</button>' : '') +
          (d.orig_path ? '<button class="m-btn ghost sm" data-act="orig" data-id="' + d.id + '">원본 받기</button>' : '') +
          (perms.manager ? '<button class="m-btn ghost sm" data-act="edit" data-id="' + d.id + '">분류</button><button class="m-btn danger sm" data-act="del" data-id="' + d.id + '">삭제</button>' : '') + '</div></div>';
      });
      html += '</div>';
    });
    return html;
  }
  function renderDocs() {
    // 연도 · 찾는 말로 먼저 거르고, 사업 · 분류 목록에 건수를 붙인 뒤 사업 → 분류 순으로 거름
    var base = DOCS.filter(function (d) {
      if (state.year && String(d.year) !== state.year) return false;
      if (state.q && ((d.title || '') + ' ' + (d.doc_no || '') + ' ' + (d.note || '')).toLowerCase().indexOf(state.q) < 0) return false;
      return true;
    });
    Array.prototype.forEach.call($('fBiz').options, function (o) {
      var n = base.filter(function (d) { return bizOf(d, o.value); }).length;
      o.textContent = o.dataset.l + (n ? ' (' + n + ')' : '');
    });
    var biz = base.filter(function (d) { return bizOf(d, state.biz); });
    var per = {}; biz.forEach(function (d) { per[d.category] = (per[d.category] || 0) + 1; });
    Array.prototype.forEach.call($('fCat').options, function (o) {
      var n = o.value ? per[o.value] || 0 : biz.length;
      o.textContent = (o.value || '전체 분류') + (n ? ' (' + n + ')' : '');
    });
    var list = state.cat ? biz.filter(function (d) { return d.category === state.cat; }) : biz;
    var bizName = state.biz ? $('fBiz').options[$('fBiz').selectedIndex].dataset.l.trim() : '';
    var on = [bizName, state.year ? state.year + '년' : '', state.cat, state.q ? '"' + state.q + '"' : ''].filter(Boolean);
    $('docCount').innerHTML = on.length
      ? '<b>' + list.length + '건</b> · ' + on.map(esc).join(' · ') + ' <span class="o-of">(전체 ' + DOCS.length + '건)</span>'
      : '전체 <b>' + DOCS.length + '건</b> · 3·1 만세길 걷기 ' + DOCS.filter(function (d) { return d.walk_no; }).length + '건 · 본부 일반 ' + DOCS.filter(function (d) { return !d.walk_no; }).length + '건';
    $('fClear').hidden = !on.length;
    if (!DOCS.length) { $('docList').innerHTML = '<div class="o-empty">아직 올린 자료가 없습니다. <b>문서 바구니</b>에 파일을 담아 공문·자료를 올려 주세요.</div>'; return; }
    if (!list.length) { $('docList').innerHTML = '<div class="o-empty">조건에 맞는 자료가 없습니다.</div>'; return; }
    // 3·1 만세길 걷기 자료는 회차별로, 본부 일반 자료는 연도별로 — 두 묶음을 따로
    var walk = list.filter(function (d) { return d.walk_no; }), gen = list.filter(function (d) { return !d.walk_no; }), html = '';
    if (walk.length) {
      html += '<div class="o-sec"><h2>3·1 만세길 걷기</h2><span>회차별 · ' + walk.length + '건</span></div>';
      var byNo = {}; walk.forEach(function (d) { (byNo[d.walk_no] = byNo[d.walk_no] || []).push(d); });
      Object.keys(byNo).sort(function (a, b) { return b - a; }).forEach(function (n) {
        html += '<h2 class="o-year">제' + n + '회 <small>' + (WALK_BASE + +n) + '년 · ' + byNo[n].length + '건</small></h2>' + catGroups(byNo[n]);
      });
    }
    if (gen.length) {
      html += '<div class="o-sec"><h2>본부 일반 자료</h2><span>연도별 · ' + gen.length + '건</span></div>';
      var byYear = {}; gen.forEach(function (d) { (byYear[d.year] = byYear[d.year] || []).push(d); });
      Object.keys(byYear).sort(function (a, b) { return b - a; }).forEach(function (y) {
        html += '<h2 class="o-year">' + y + '년 <small>' + byYear[y].length + '건</small></h2>' + catGroups(byYear[y]);
      });
    }
    $('docList').innerHTML = html;
  }
  // 분류 바꾸기 (운영임원) — 걷기 회차 · 종류 · 연도 · 제목
  var docEditing = null;
  function openDocMeta(d) {
    docEditing = d;
    $('dTitle').value = d.title || ''; $('dYear').value = d.year || ''; $('dCat').value = d.category;
    $('dWalk').innerHTML = walkOptions(d.walk_no || ''); $('docMsg').className = 'm-msg';
    $('docModal').classList.add('on'); $('dWalk').focus();
  }
  async function saveDocMeta(e) {
    e.preventDefault(); var d = docEditing; if (!d) return;
    var row = { walk_no: parseInt($('dWalk').value, 10) || null, category: $('dCat').value, year: parseInt($('dYear').value, 10), title: $('dTitle').value.trim() };
    if (!row.year || !row.title) return note($('docMsg'), 'err', '연도와 제목을 입력해 주세요.');
    var r = await window.msb.from('docs').update(row).eq('id', d.id).select().single();
    if (r.error) return note($('docMsg'), 'err', window.mErr(r.error));
    Object.assign(d, r.data); $('docModal').classList.remove('on'); loadDocs();
  }
  // 현행 회칙: 아카이브에서 '회칙' 자료 중 가장 최근 것을 연다
  async function openBylaws() {
    var list = DOCS.filter(function (d) { return /회칙/.test(d.title) && d.path; }).sort(function (a, b) { return (b.doc_date || '').localeCompare(a.doc_date || ''); });
    if (!list.length) return alert('아직 회칙 자료가 올라와 있지 않습니다. 자료 올리기에서 회칙(PDF)을 올려 주세요.');
    var w = window.open('', '_blank');
    try { var u = await signed(list[0].path); if (w) w.location = u; else location.href = u; } catch (ex) { if (w) w.close(); alert(window.mErr(ex)); }
  }
  async function signed(path, download) {
    var opt = download ? { download: download } : undefined;
    var r = await window.msb.storage.from(BUCKET).createSignedUrl(path, 600, opt);
    if (r.error) throw r.error;
    return r.data.signedUrl;
  }
  async function onDocAction(e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var d = DOCS.find(function (x) { return x.id === b.dataset.id; }); if (!d) return;
    if (b.dataset.act === 'view' || b.dataset.act === 'orig') {
      var w = window.open('', '_blank');          // 팝업 차단 방지: 클릭 순간 창을 먼저 연다
      try {
        var url = b.dataset.act === 'view' ? await signed(d.path) : await signed(d.orig_path, d.orig_name || (d.title + '.' + extOf(d.orig_path)));
        if (w) w.location = url; else location.href = url;
      } catch (ex) { if (w) w.close(); alert(window.mErr(ex)); }
    } else if (b.dataset.act === 'edit') {
      openDocMeta(d);
    } else if (b.dataset.act === 'del') {
      if (!confirm('"' + d.title + '" 자료를 삭제할까요? 파일도 함께 지워집니다.')) return;
      var paths = [d.path, d.orig_path].filter(Boolean);
      if (paths.length) { var s = await window.msb.storage.from(BUCKET).remove(paths); if (s.error) return alert(window.mErr(s.error)); }
      var r = await window.msb.from('docs').delete().eq('id', d.id);
      if (r.error) return alert(window.mErr(r.error));
      DOCS = DOCS.filter(function (x) { return x.id !== d.id; }); renderDocs();
    }
  }

  // ---------------- 임원 명단 ----------------
  var editing = null;
  function setupRoster() {
    $('oRole').innerHTML = ROLES.map(function (r) { return '<option>' + r + '</option>'; }).join('');
    $('addOfficer').addEventListener('click', function () { openOfficer(null); });
    $('rosterTable').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-oid]'); if (!b) return;
      openOfficer(OFFICERS.find(function (o) { return o.id === b.dataset.oid; }));
    });
    $('offModal').addEventListener('click', function (e) { if (e.target === this || e.target.hasAttribute('data-close')) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    $('offForm').addEventListener('submit', saveOfficer);
    $('offDel').addEventListener('click', deleteOfficer);
  }
  async function loadRoster() {
    var r = await window.msb.from('officers').select('*').order('active', { ascending: false }).order('sort').order('name');
    if (r.error) { $('rosterTable').innerHTML = '<tr><td>' + esc(window.mErr(r.error)) + '</td></tr>'; return; }
    OFFICERS = r.data || []; renderRoster();
  }
  function memberByEmail(email) {
    if (!email) return null; var e = email.toLowerCase();
    return MEMBERS.find(function (m) { return (m.email || '').toLowerCase() === e; }) || null;
  }
  function renderRoster() {
    var mgr = perms.manager;
    $('rosterCount').textContent = '재직 ' + OFFICERS.filter(function (o) { return o.active; }).length + '명 · 전체 ' + OFFICERS.length + '명';
    var head = '<tr><th>직책</th><th>이름</th><th>소속</th><th>로그인 이메일</th><th>연락처</th><th>임기</th><th>상태</th>' + (mgr ? '<th>가입</th><th></th>' : '') + '</tr>';
    var rows = OFFICERS.map(function (o) {
      var m = mgr ? memberByEmail(o.email) : null;
      var join = !o.email ? '<span class="chip gray">이메일 없음</span>' : (m ? (m.suspended_at ? '<span class="chip bad">정지</span>' : '<span class="chip ok">가입됨</span>') : '<span class="chip gold">미가입</span>');
      return '<tr class="' + (o.active ? '' : 'off') + '"><td><b>' + esc(o.role) + '</b></td><td>' + esc(o.name) + '</td><td>' + esc(o.church || '') +
        '</td><td>' + esc(o.email || '') + '</td><td>' + esc(o.phone || '') + '</td><td>' + esc(o.term || '') + '</td><td>' +
        (o.active ? '<span class="chip navy">재직</span>' : '<span class="chip gray">퇴임</span>') + '</td>' +
        (mgr ? '<td>' + join + '</td><td><button class="m-btn ghost sm" data-oid="' + o.id + '">수정</button></td>' : '') + '</tr>';
    }).join('');
    $('rosterTable').innerHTML = head + (rows || '<tr><td colspan="9">등록된 임원이 없습니다.</td></tr>');
  }
  function openOfficer(o, preset) {
    editing = o || null; var v = o || preset || {};
    $('offTitle').textContent = o ? '임원 정보 수정' : '임원 추가';
    $('oName').value = v.name || ''; $('oRole').value = v.role || '부회장'; $('oEmail').value = v.email || '';
    $('oChurch').value = v.church || ''; $('oPhone').value = v.phone || ''; $('oTerm').value = v.term || '';
    $('oSort').value = v.sort != null ? v.sort : 100; $('oNote').value = v.note || ''; $('oActive').checked = o ? !!o.active : true;
    $('offDel').hidden = !o; $('offMsg').className = 'm-msg';
    $('offModal').classList.add('on'); $('oName').focus();
  }
  window.__openOfficer = openOfficer;
  function closeModal() { $('offModal').classList.remove('on'); }
  async function saveOfficer(e) {
    e.preventDefault();
    var row = { name: $('oName').value.trim(), role: $('oRole').value, email: $('oEmail').value.trim().toLowerCase() || null,
      church: $('oChurch').value.trim() || null, phone: $('oPhone').value.trim() || null, term: $('oTerm').value.trim() || null,
      sort: parseInt($('oSort').value, 10) || 100, note: $('oNote').value.trim() || null, active: $('oActive').checked };
    if (!row.name) return note($('offMsg'), 'err', '이름을 입력해 주세요.');
    var r = editing ? await window.msb.from('officers').update(row).eq('id', editing.id) : await window.msb.from('officers').insert(row);
    if (r.error) return note($('offMsg'), 'err', /duplicate|unique/i.test(r.error.message) ? '같은 이메일의 재직 임원이 이미 있습니다.' : window.mErr(r.error));
    closeModal(); loadRoster(); if (perms.manager) renderMembers();
  }
  async function deleteOfficer() {
    if (!editing || !confirm(editing.name + ' 임원을 명단에서 삭제할까요? (기록을 남기려면 삭제 대신 "재직"을 해제하세요)')) return;
    var r = await window.msb.from('officers').delete().eq('id', editing.id);
    if (r.error) return note($('offMsg'), 'err', window.mErr(r.error));
    closeModal(); loadRoster();
  }

  // ---------------- 회원 관리 (운영임원) ----------------
  async function loadMembers() {
    var r = await window.msb.from('profiles').select('*').order('created_at', { ascending: false });
    if (r.error) { $('memTable').innerHTML = '<tr><td>' + esc(window.mErr(r.error)) + '</td></tr>'; return; }
    MEMBERS = r.data || []; renderMembers(); renderRoster();
    $('mSearch').oninput = filterMembers;
    $('memTable').onclick = onMemberAction;
  }
  function renderMembers() {
    var officerEmails = {};
    OFFICERS.forEach(function (o) { if (o.active && o.email) officerEmails[o.email.toLowerCase()] = o.role; });
    var head = '<tr><th>이름</th><th>이메일</th><th>연락처</th><th>소속</th><th>가입일</th><th>연동</th><th>임원</th><th>상태</th><th></th></tr>';
    var rows = MEMBERS.map(function (m) {
      var st = m.withdrawn_at ? '<span class="chip gray">탈퇴 ' + m.withdrawn_at.slice(0, 10) + '</span>'
        : m.suspended_at ? '<span class="chip bad" title="' + esc(m.suspend_note || '') + '">정지 ' + m.suspended_at.slice(0, 10) + '</span>' + (m.suspend_note ? '<div class="m-help">' + esc(m.suspend_note) + '</div>' : '')
        : '<span class="chip ok">정상</span>';
      var role = m.email && officerEmails[m.email.toLowerCase()];
      var act = '';
      if (!m.withdrawn_at && m.id !== me.id) {
        act = m.suspended_at ? '<button class="m-btn ghost sm" data-sus="0" data-mid="' + m.id + '">정지 해제</button>'
          : '<button class="m-btn danger sm" data-sus="1" data-mid="' + m.id + '">정지</button>';
        if (!role) act += ' <button class="m-btn ghost sm" data-addoff="' + m.id + '">임원 등록</button>';
      }
      return '<tr data-search="' + esc(((m.name || '') + ' ' + (m.email || '')).toLowerCase()) + '"><td>' + esc(m.name || '') + '</td><td>' + esc(m.email || '') +
        '</td><td>' + esc(m.phone || '') + '</td><td>' + esc(m.church || '') + '</td><td>' + (m.created_at || '').slice(0, 10) + '</td><td>' +
        (m.samgoe_uid ? '<span class="chip ok" title="' + esc(m.samgoe_email || '') + '">연동</span>' : '') + '</td><td>' + (role ? '<span class="chip navy">' + esc(role) + '</span>' : '') +
        '</td><td>' + st + '</td><td style="white-space:nowrap">' + act + '</td></tr>';
    }).join('');
    $('memTable').innerHTML = head + (rows || '<tr><td colspan="9">가입한 회원이 없습니다.</td></tr>');
    filterMembers();
  }
  function filterMembers() {
    var q = ($('mSearch').value || '').trim().toLowerCase(), shown = 0, rows = $('memTable').querySelectorAll('tr[data-search]');
    rows.forEach(function (tr) { var ok = !q || tr.dataset.search.indexOf(q) >= 0; tr.style.display = ok ? '' : 'none'; if (ok) shown++; });
    $('memCount').textContent = q ? '(' + shown + '/' + rows.length + '명)' : '회원 ' + rows.length + '명';
  }
  async function onMemberAction(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.addoff) {
      var m = MEMBERS.find(function (x) { return x.id === b.dataset.addoff; });
      document.querySelector('.o-tab[data-tab="roster"]').click();
      openOfficer(null, { name: m.name, email: m.email, church: m.church, phone: m.phone });
      return;
    }
    if (!b.dataset.mid) return;
    var suspend = b.dataset.sus === '1', target = MEMBERS.find(function (x) { return x.id === b.dataset.mid; });
    var reason = null;
    if (suspend) { reason = prompt((target.name || target.email) + ' 회원을 정지합니다. 사유를 적어 주세요(운영 담당자만 봅니다).'); if (reason === null) return; }
    else if (!confirm((target.name || target.email) + ' 회원의 정지를 해제할까요?')) return;
    var r = await window.msb.rpc('admin_set_suspend', { target: target.id, suspend: suspend, note: reason });
    if (r.error) return alert(window.mErr(r.error));
    loadMembers();
  }

  // ---------------- 자료 올리기 ----------------
  // ---------------- 문서 바구니 (삼기연 관리자 메뉴와 같은 방식) ----------------
  //  파일을 바구니에 담으면 이름으로 종류 · 연도 · 날짜 · 걷기 회차를 자동으로 정해 '분류 대기'(status=pending)로 올리고,
  //  분류를 확인해 승인하면 공문 · 자료(filed)로 옮겨짐. 같은 이름의 PDF와 HWP는 한 건(열람용 + 원본)으로 묶음.
  function setupUpload() {
    $('bkInput').addEventListener('change', function () { basketAdd(Array.from(this.files || []).map(function (f) { return { file: f, path: '/' + f.name }; })); this.value = ''; });
    $('bkList').addEventListener('click', onBasketAction);
    $('bkAll').addEventListener('click', approveAll);
    $('dirPick').addEventListener('change', pickFolder);
    $('bulkGo').addEventListener('click', runBulk);
    if ($('migGo')) $('migGo').addEventListener('click', runMigration);
    var dz = $('dropZone');
    dz.addEventListener('click', function () { $('bkInput').click(); });
    ['dragenter', 'dragover'].forEach(function (t) { dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('over'); });
    dz.addEventListener('drop', onDrop);
  }
  // 파일 이름으로 종류 정하기 (앞에서부터 처음 맞는 것)
  var CAT_RULES = [
    ['홍보·언론', /보도\s*자료|언론|기사|신문|방송|취재/], ['단체 기본', /회칙|정관|규정|단체\s*소개|조직도|고유번호|등록증|표창/],
    ['회의록', /회의록|회의\s*자료|회의\s*결과|임원\s*회의|총회|안건/], ['명부·개인정보', /명부|회원\s*명단|개인\s*정보|연락처\s*명단/],
    ['공고·고시', /공고|고시|선정\s*결과/], ['공모·협약·보조금', /보조금|교부|공모|지원\s*신청|협약|정산/],
    ['회계·예산', /예산|결산|회계|영수증|통장|지출|수입/], ['공문(수신)', /수신|(^|[^집])회신|통보/], ['공문(발신)', /공문|요청|신고|협조|발신/],
    ['행정·대관', /대관|사용\s*신청|사용\s*허가|점용|허가/], ['행사 운영', /순서지|명찰|명패|포스터|시안|현수막|봉투|초대|식순|큐시트|진행표/],
    ['계획·보고', /계획|보고|제안서|간담회|전략|평가|결과/], ['교회 연합 활동', /연합\s*예배|연합\s*기도|교회/]
  ];
  function guessCat(t) { for (var i = 0; i < CAT_RULES.length; i++) { if (CAT_RULES[i][1].test(t)) return CAT_RULES[i][0]; } return '기타'; }
  function guessDate(t) { var m = /(20\d{2})[.\-_]?(0[1-9]|1[0-2])[.\-_]?(0[1-9]|[12]\d|3[01])(?!\d)/.exec(t || ''); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; }
  function cleanName(n) { return baseName(n).replace(/^(19|20)\d{2}_/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim(); }
  function guessDoc(name) {
    var t = baseName(name), y = /(19|20)\d{2}/.exec(t), year = y ? +y[0] : new Date().getFullYear(), cat = guessCat(t);
    if (cat === '명부·개인정보' && !perms.manager) cat = '기타';
    return { title: cleanName(name) || baseName(name), year: year, cat: cat, date: guessDate(t), walk: walkGuess(t, year) };
  }
  async function basketAdd(list) {
    var msg = $('bkMsg'); msg.className = 'm-msg';
    list = list.filter(function (x) { return !/(^|\/)(\.|~\$|Thumbs\.db|desktop\.ini|manifest\.json$)/i.test(x.path); });
    var groups = {}; list.forEach(function (x) { var k = baseName(x.file.name); (groups[k] = groups[k] || []).push(x.file); });
    var items = Object.keys(groups).map(function (k) {
      var fs = groups[k], view = fs.find(function (f) { return /\.pdf$/i.test(f.name); }) || fs[0];
      return { view: view, orig: fs.find(function (f) { return f !== view; }) || null };
    });
    var big = items.filter(function (m) { return m.view.size > 50 * 1048576 || (m.orig && m.orig.size > 50 * 1048576); });
    items = items.filter(function (m) { return big.indexOf(m) < 0; });
    if (!items.length) return note(msg, 'err', big.length ? '50MB가 넘는 파일은 올릴 수 없습니다.' : '올릴 파일이 없습니다.');
    var ok = 0, fail = [];
    for (var i = 0; i < items.length; i++) {
      var m = items[i], g = guessDoc(m.view.name), sens = g.cat === '명부·개인정보';
      msg.textContent = '바구니에 담는 중… (' + (i + 1) + ' / ' + items.length + ') ' + m.view.name;
      $('bkBar').style.width = Math.round(i / items.length * 100) + '%';
      try {
        var path = await putFile(m.view, g.year, g.cat, sens), orig = m.orig ? await putFile(m.orig, g.year, g.cat, sens) : null;
        await insertDoc({ year: g.year, category: g.cat, title: g.title, walk_no: g.walk, doc_date: toDate(g.date), date_text: g.date || null, doc_no: null, note: null,
          path: path, mime: m.view.type || MIME[extOf(m.view.name)] || null, size: m.view.size + (m.orig ? m.orig.size : 0),
          orig_path: orig, orig_name: m.orig ? m.orig.name : null, sensitive: sens, status: 'pending', uploaded_by: me.id, uploader_name: profile.name || me.email });
        ok++;
      } catch (ex) { fail.push(m.view.name + ': ' + window.mErr(ex)); }
    }
    $('bkBar').style.width = '100%';
    note(msg, fail.length ? 'err' : 'ok', ok + '건을 바구니에 담았습니다. 아래 분류 대기에서 확인하고 승인해 주세요.' +
      (fail.length ? ' · ' + fail.length + '건 실패 (' + fail[0] + ')' : '') + (big.length ? ' · 50MB 넘는 ' + big.length + '건 제외' : ''));
    await loadDocs();
    setTimeout(function () { $('bkBar').style.width = '0'; }, 800);
  }
  function renderBasket() {
    var pend = ALLDOCS.filter(function (d) { return d.status === 'pending'; });
    $('bkTab').textContent = pend.length ? pend.length : '';
    $('bkCount').textContent = pend.length ? pend.length + '건' : '';
    $('bkAll').hidden = !pend.length;
    if (!pend.length) { $('bkList').innerHTML = '<div class="o-empty">분류를 기다리는 자료가 없습니다.</div>'; return; }
    var cats = CATS.filter(function (c) { return perms.manager || c !== '명부·개인정보'; });
    $('bkList').innerHTML = pend.map(function (d) {
      var mine = d.uploaded_by === me.id, can = perms.manager || mine;
      return '<div class="bk-row" data-id="' + d.id + '">' +
        '<div class="bk-top"><span class="bk-ic">' + esc((extOf(d.path) === 'pdf' ? 'PDF' : extOf(d.path).toUpperCase()).slice(0, 4)) + '</span>' +
          '<input class="m-in bk-t" maxlength="300" value="' + esc(d.title) + '" aria-label="제목"' + (can ? '' : ' disabled') + ' />' +
          '<span class="bk-m">' + [d.orig_name ? '원본 ' + d.orig_name : '', fmtSize(d.size), d.uploader_name || ''].filter(Boolean).map(esc).join(' · ') + '</span></div>' +
        '<div class="bk-ctl">' +
          '<label>사업 구분<select class="m-in bk-w"' + (can ? '' : ' disabled') + '>' + walkOptions(d.walk_no || '') + '</select></label>' +
          '<label>종류 <span class="bk-sug">자동 추천</span><select class="m-in bk-c"' + (can ? '' : ' disabled') + '>' + cats.concat(cats.indexOf(d.category) < 0 ? [d.category] : []).map(function (c) { return '<option' + (c === d.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
          '<label>연도<input class="m-in bk-y" type="number" min="1990" max="2100" value="' + (d.year || '') + '"' + (can ? '' : ' disabled') + ' /></label>' +
          '<label>날짜<input class="m-in bk-d" placeholder="YYYY-MM-DD" value="' + esc(d.date_text || d.doc_date || '') + '"' + (can ? '' : ' disabled') + ' /></label>' +
          '<div class="bk-btns">' + (can ? '<button class="m-btn sm" type="button" data-bk="ok">승인 · 이동</button><button class="m-btn danger sm" type="button" data-bk="del">삭제</button>'
            : '<span class="bk-wait">올린 분이나 대표회장 · 서기가 승인합니다</span>') + '</div>' +
        '</div></div>';
    }).join('');
  }
  function bkValues(row) {
    var ds = row.querySelector('.bk-d').value.trim(), cat = row.querySelector('.bk-c').value;
    return { title: row.querySelector('.bk-t').value.trim(), category: cat, walk_no: parseInt(row.querySelector('.bk-w').value, 10) || null,
      year: parseInt(row.querySelector('.bk-y').value, 10), doc_date: toDate(ds), date_text: ds || null, sensitive: cat === '명부·개인정보', status: 'filed' };
  }
  async function approveRow(row) {
    var v = bkValues(row);
    if (!v.title || !v.year) throw new Error('제목과 연도를 입력해 주세요.');
    var r = await window.msb.from('docs').update(v).eq('id', row.dataset.id).select('id');
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error('승인하지 못했습니다 — 다른 분이 올린 자료는 대표회장 · 서기가 승인합니다.');
  }
  async function onBasketAction(e) {
    var b = e.target.closest('button[data-bk]'); if (!b) return;
    var row = b.closest('.bk-row'), d = ALLDOCS.find(function (x) { return x.id === row.dataset.id; }); if (!d) return;
    b.disabled = true;
    try {
      if (b.dataset.bk === 'ok') { await approveRow(row); }
      else {
        if (!confirm('"' + d.title + '" 자료를 바구니에서 지울까요? 올린 파일도 함께 지워집니다.')) { b.disabled = false; return; }
        var s = await window.msb.storage.from(BUCKET).remove([d.path, d.orig_path].filter(Boolean));
        if (s.error) throw s.error;
        var r = await window.msb.from('docs').delete().eq('id', d.id).select('id');
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) throw new Error('지우지 못했습니다 — 대표회장 · 서기에게 부탁해 주세요.');
      }
      await loadDocs();
    } catch (ex) { b.disabled = false; alert(window.mErr(ex)); }
  }
  async function approveAll() {
    var rows = Array.prototype.slice.call($('bkList').querySelectorAll('.bk-row')).filter(function (r) { return r.querySelector('[data-bk="ok"]'); });
    if (!rows.length || !confirm(rows.length + '건을 모두 승인해 공문 · 자료로 옮길까요?')) return;
    var fail = [];
    for (var i = 0; i < rows.length; i++) { try { await approveRow(rows[i]); } catch (ex) { fail.push(window.mErr(ex)); } }
    await loadDocs();
    if (fail.length) alert(fail.length + '건은 승인하지 못했습니다: ' + fail[0]);
  }

  // 처음 넣은 활동 사진(홈페이지 파일) → 사진 저장소(manse-photos)로 옮기기. 이미 옮긴 것은 건너뜀.
  async function runMigration() {
    var btn = $('migGo'), log = $('migLog'), info = $('migInfo');
    btn.disabled = true; log.hidden = false; log.textContent = '';
    try {
      if (!window.MANSE_DATA) await new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'archive/data.js?v=' + Date.now(); s.onload = res; s.onerror = function () { rej(new Error('사진 목록(data.js)을 불러오지 못했습니다.')); }; document.head.appendChild(s); });
      var items = [];
      window.MANSE_DATA.events.forEach(function (e) { (e.photos || []).forEach(function (p, i) { items.push({ ev: e.id, f: p[0], w: p[1], h: p[2], c: p[3] || '', i: i }); }); });
      if (!items.length) { info.textContent = '옮길 사진이 없습니다. (이미 모두 옮겨졌습니다)'; return; }
      var ex = await window.msb.from('activity_photos').select('path');
      if (ex.error) throw ex.error;
      var have = {}; (ex.data || []).forEach(function (r) { have[r.path] = 1; });
      var todo = items.filter(function (it) { return !have[it.ev + '/s-' + it.f]; });
      info.textContent = '전체 ' + items.length + '장 중 ' + (items.length - todo.length) + '장은 이미 옮겨졌고, ' + todo.length + '장을 옮깁니다.';
      var done = 0, fail = 0, next = 0;
      async function one(it) {
        var path = it.ev + '/s-' + it.f, tpath = it.ev + '/t/s-' + it.f;
        var full = await (await fetch('archive/photos/' + it.ev + '/' + it.f)).blob();
        var th = await (await fetch('archive/photos/' + it.ev + '/t/' + it.f)).blob();
        var u1 = await window.msb.storage.from('manse-photos').upload(path, full, { contentType: 'image/webp', upsert: false });
        if (u1.error && !/exist|duplicate/i.test(u1.error.message)) throw u1.error;
        var u2 = await window.msb.storage.from('manse-photos').upload(tpath, th, { contentType: 'image/webp', upsert: false });
        if (u2.error && !/exist|duplicate/i.test(u2.error.message)) throw u2.error;
        var ins = await window.msb.from('activity_photos').insert({ event_key: it.ev, path: path, thumb_path: tpath, w: it.w, h: it.h,
          caption: it.c, sort: it.i, uploaded_by: me.id, uploader_name: '삼일만세운동본부' });
        if (ins.error) throw ins.error;
      }
      async function worker() {
        while (next < todo.length) {
          var it = todo[next++];
          try { await one(it); done++; } catch (ex) { fail++; log.textContent += '✗ ' + it.ev + '/' + it.f + ' : ' + window.mErr(ex) + '\n'; }
          $('migBar').style.width = Math.round((done + fail) / todo.length * 100) + '%';
          info.textContent = '옮기는 중… ' + (done + fail) + ' / ' + todo.length + '장';
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()]);   // 4장씩 동시에
      info.textContent = '완료: ' + done + '장 옮김' + (fail ? ', ' + fail + '장 실패 — 다시 누르면 실패한 것만 이어서 옮깁니다.' : '. 이제 서기(관리자)에게 완료를 알려 주세요.');
    } catch (ex) { info.textContent = window.mErr(ex); }
    btn.disabled = false;
  }
  async function putFile(file, year, cat, sens) {
    var key = keyFor(year, cat, file.name, sens);
    var r = await window.msb.storage.from(BUCKET).upload(key, file, { contentType: file.type || MIME[extOf(file.name)] || 'application/octet-stream', upsert: false });
    if (r.error) throw r.error;
    return key;
  }
  async function insertDoc(meta) {
    var r = await window.msb.from('docs').insert(meta).select().single();
    if (r.error) throw r.error;
    return r.data;
  }
  // 정리된 폴더 일괄 (운영임원): manifest.json { "연도/종류/파일.pdf": {year, category, title, date, no, sensitive, orig, orig2} }
  //  - '임원방_업로드자료' 폴더: manifest 기준으로 연도·종류·제목이 자동으로 정해져 바로 공문 · 자료로
  //  - manifest가 없으면 문서 바구니로 (자동 분류 → 분류 대기)
  var bulk = null;
  function pickFolder() {
    var list = Array.from(this.files || []).map(function (f) { return { file: f, path: '/' + (f.webkitRelativePath || f.name) }; });
    if (list.some(function (x) { return /(^|\/)manifest\.json$/.test(x.path); })) analyze(list); else basketAdd(list);
    this.value = '';
  }
  // 끌어다 놓기: 폴더 안까지 모두 읽음
  function readEntry(entry, out) {
    return new Promise(function (res) {
      if (entry.isFile) { entry.file(function (f) { out.push({ file: f, path: entry.fullPath }); res(); }, function () { res(); }); return; }
      var rd = entry.createReader(), all = [];
      (function more() { rd.readEntries(function (ents) { if (!ents.length) { Promise.all(all.map(function (en) { return readEntry(en, out); })).then(res); return; } all = all.concat(Array.from(ents)); more(); }, function () { res(); }); })();
    });
  }
  async function onDrop(e) {
    e.preventDefault(); $('dropZone').classList.remove('over');
    var out = [], items = Array.from(e.dataTransfer.items || []);
    var entries = items.map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }).filter(Boolean);
    if (entries.length) await Promise.all(entries.map(function (en) { return readEntry(en, out); }));
    else Array.from(e.dataTransfer.files || []).forEach(function (f) { out.push({ file: f, path: '/' + f.name }); });
    if (perms.manager && out.some(function (x) { return /(^|\/)manifest\.json$/.test(x.path); })) await analyze(out, true);   // 정리된 폴더
    else await basketAdd(out);
  }
  function baseName(n) { return n.replace(/\.[^.]+$/, ''); }
  // manifest에 회차가 없을 때: 제목에 '걷기'가 있으면 그 해 회차 (제목의 '제N회'가 먼저)
  function walkGuess(title, year) {
    if (!/걷기/.test(title || '')) return null;
    var m = /제\s*(\d{1,2})\s*회/.exec(title), n = m ? +m[1] : (year || 0) - WALK_BASE;
    return n >= 1 && n <= 99 ? n : null;
  }
  async function analyze(list, autoStart) {
    list = list.filter(function (x) { return !/(^|\/)(\.|~\$|Thumbs\.db|desktop\.ini)/i.test(x.path); });
    var man = list.find(function (x) { return /(^|\/)manifest\.json$/.test(x.path); }), items;
    if (man) {
      var base = man.path.replace(/manifest\.json$/, ''), byRel = {};
      list.forEach(function (x) { if (x.path.indexOf(base) === 0) byRel[x.path.slice(base.length)] = x.file; });
      var mf = JSON.parse(await man.file.text());
      items = Object.keys(mf).map(function (rel) { var m = mf[rel]; m.rel = rel; m.file = byRel[rel]; m.origFile = m.orig ? byRel[m.orig] : null; m.walk = parseInt(m.walk, 10) || walkGuess(m.title, m.year); return m; })
        .filter(function (m) { return m.file; });
    } else return basketAdd(list);
    var tooBig = items.filter(function (m) { return m.file.size > 50 * 1048576 || (m.origFile && m.origFile.size > 50 * 1048576); });
    items = items.filter(function (m) { return tooBig.indexOf(m) < 0; });
    var have = {}; DOCS.forEach(function (d) { have[d.year + '|' + d.category + '|' + d.title] = 1; });
    var todo = items.filter(function (m) { return !have[m.year + '|' + m.category + '|' + m.title]; });
    bulk = { items: todo };
    var sens = todo.filter(function (m) { return m.sensitive; }).length;
    $('bulkInfo').innerHTML = '정리된 폴더(manifest) 기준 · ' +
      '자료 ' + items.length + '건 중 <b>' + todo.length + '건</b>을 올립니다' + (items.length - todo.length ? ' (이미 있는 ' + (items.length - todo.length) + '건 건너뜀)' : '') +
      (sens ? '. 개인정보 포함 ' + sens + '건' : '') + (tooBig.length ? '. 50MB 넘는 ' + tooBig.length + '건 제외' : '') + '.';
    $('bulkGo').disabled = !todo.length;
    if (autoStart && todo.length && confirm(todo.length + '건을 한꺼번에 올릴까요?')) runBulk();
  }
  async function runBulk() {
    if (!bulk) return;
    var withSens = $('bulkSens').checked, list = bulk.items.filter(function (m) { return withSens || !m.sensitive; });
    var log = $('bulkLog'); log.hidden = false; log.textContent = ''; $('bulkGo').disabled = true; $('dirPick').disabled = true;
    var ok = 0, fail = 0;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      try {
        var path = await putFile(m.file, m.year, m.category, m.sensitive);
        var orig = m.origFile ? await putFile(m.origFile, m.year, m.category, m.sensitive) : null;
        await insertDoc({ year: m.year, category: m.category, title: m.title, walk_no: m.walk || null, doc_date: toDate(m.date), date_text: m.date || null, doc_no: m.no || null,
          note: m.orig_note || null, path: path, mime: m.file.type || MIME[extOf(m.file.name)] || null, size: m.file.size + (m.origFile ? m.origFile.size : 0),
          orig_path: orig, orig_name: m.origFile ? m.title + '.' + extOf(m.origFile.name) : null, sensitive: !!m.sensitive,
          uploaded_by: me.id, uploader_name: profile.name || me.email });
        ok++; log.textContent += '✓ ' + m.year + ' ' + m.category + ' — ' + m.title + '\n';
      } catch (ex) { fail++; log.textContent += '✗ ' + m.title + ' : ' + window.mErr(ex) + '\n'; }
      $('bulkBar').style.width = Math.round((i + 1) / list.length * 100) + '%';
      log.scrollTop = log.scrollHeight;
    }
    log.textContent += '\n완료: 성공 ' + ok + '건, 실패 ' + fail + '건';
    $('dirPick').disabled = false; bulk = null; loadDocs();
  }

  // ---------------- 3·1 만세길 걷기 참가 교회 (manse-walk-setup.sql) ----------------
  //  참가 신청은 이 홈페이지(walk.html)에서 받고, 교회별 인원은 신청 기록을 묶어서 보여 줌
  //  신청 기록이 없는 지난 회차는 교회별 인원만 남은 기록(walk_runs · walk_churches — walk_import 로 넣은 지난 기록)으로 보여 줌
  var RUNS = [], WCH = [];
  function n0(v) { return Number(v || 0).toLocaleString('ko-KR'); }
  function dot(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[1] + '.' + m[2] + '.' + m[3] : ''; }
  function when(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); }
  function setupWalks() {
    $('wkDocs').addEventListener('click', function (e) {   // 걷기 공문 · 자료만 모아 보기
      e.preventDefault(); state.biz = 'walk'; state.cat = state.year = state.q = '';
      $('fBiz').value = 'walk'; $('fCat').value = $('fYear').value = $('fText').value = ''; renderDocs();
      document.querySelector('.o-tab[data-tab="docs"]').click(); window.scrollTo(0, 0);
    });
    $('wkSel').addEventListener('change', renderWalks);
    $('wkQ').addEventListener('input', renderWalks);
    $('wkPrint').addEventListener('click', function () { window.print(); });
  }
  // 교회별 참가 인원 — 이 홈페이지의 참가 신청 기록(walk_applications)을 회차 · 교회로 묶음 (신청자 이름은 쓰지 않음)
  async function loadWalks() {
    var a = await window.msb.from('walk_events').select('event,no,title,event_date,place').order('no', { ascending: false });
    var b = a.error ? a : await window.msb.from('walk_applications').select('event,church,adults,minors').range(0, 9999);
    if (a.error || b.error) {
      var m = String(((a.error || b.error) || {}).message || '');
      $('wkSum').innerHTML = ''; $('wkTable').innerHTML = '<tr><td>' + esc(/walk_events|walk_applications|does not exist|schema cache/i.test(m)
        ? '걷기대회 기록을 쓰려면 먼저 설치 SQL(manse-walk-setup.sql)을 실행해 주세요.' : window.mErr(a.error || b.error)) + '</td></tr>';
      return;
    }
    var CHN = {}; (window.CHURCHES || []).forEach(function (c) { CHN[c.name.replace(/\s/g, '')] = c; });
    var byEv = {}; WCH = [];
    (b.data || []).forEach(function (r) {
      var k = String(r.church || '').replace(/\s/g, ''), c = CHN[k] || CHN[k + '교회'], name = c ? c.name : (String(r.church || '').trim() || '(교회 미입력)');
      var ev = (a.data || []).filter(function (e) { return e.event === r.event; })[0]; if (!ev) return;
      var key = ev.no + '|' + name, x = byEv[key];
      if (!x) { x = byEv[key] = { walk_no: ev.no, church: name, region: c ? c.region || '' : '', apps: 0, adults: 0, minors: 0 }; WCH.push(x); }
      x.apps++; x.adults += r.adults || 0; x.minors += r.minors || 0;
    });
    RUNS = (a.data || []).filter(function (e) { return WCH.some(function (c) { return c.walk_no === e.no; }); })
      .map(function (e) { return { walk_no: e.no, event: e.event, title: e.title, event_date: e.event_date, place: e.place, churches: WCH.filter(function (c) { return c.walk_no === e.no; }).length }; });
    var oldR = await window.msb.from('walk_runs').select('walk_no,event_key,title,event_date,place').order('walk_no', { ascending: false });
    var oldC = oldR.error ? oldR : await window.msb.from('walk_churches').select('walk_no,church,region,apps,adults,minors').range(0, 9999);
    if (!oldR.error && !oldC.error) (oldR.data || []).forEach(function (r) {
      if (RUNS.some(function (x) { return x.walk_no === r.walk_no; })) return;   // 신청 기록이 있으면 그쪽
      var cs = (oldC.data || []).filter(function (c) { return c.walk_no === r.walk_no; }); if (!cs.length) return;
      cs.forEach(function (c) { WCH.push({ walk_no: r.walk_no, church: c.church, region: c.region || '', apps: c.apps || 0, adults: c.adults || 0, minors: c.minors || 0 }); });
      var ev = (a.data || []).filter(function (e) { return e.no === r.walk_no; })[0] || {};
      RUNS.push({ walk_no: r.walk_no, event: ev.event || r.event_key || '', title: ev.title || r.title, event_date: ev.event_date || r.event_date, place: ev.place || r.place, churches: cs.length, past: true });
    });
    RUNS.sort(function (x, y) { return y.walk_no - x.walk_no; });
    var sel = $('wkSel'), cur = sel.value;
    sel.innerHTML = RUNS.map(function (r) { return '<option value="' + r.walk_no + '">제' + r.walk_no + '회' + (r.event_date ? ' · ' + dot(r.event_date) : '') + ' — 교회 ' + r.churches + '곳</option>'; }).join('') +
      (RUNS.length > 1 ? '<option value="all">회차별 비교 (교회마다 몇 번 참가했는지)</option>' : '');
    sel.value = cur && sel.querySelector('option[value="' + cur + '"]') ? cur : (RUNS[0] ? String(RUNS[0].walk_no) : '');
    renderWalks();
  }
  function renderWalks() {
    var v = $('wkSel').value, q = $('wkQ').value.trim().replace(/\s/g, '');
    var hit = function (c) { return !q || c.replace(/\s/g, '').indexOf(q) >= 0; };
    if (!RUNS.length) {
      $('wkCount').textContent = ''; $('wkSum').innerHTML = '';
      $('wkTable').innerHTML = '<tr><td style="padding:28px;text-align:center;color:var(--muted)">아직 참가 신청 기록이 없습니다. <a href="walk-admin.html">행사(회차) · 신청 기록</a>에서 회차를 만들고 신청을 받으면 여기에 교회별로 쌓입니다.</td></tr>';
      return;
    }
    if (v === 'all') {   // 교회 × 회차
      var runs = RUNS.slice().sort(function (a, b) { return a.walk_no - b.walk_no; }), by = {};
      WCH.forEach(function (c) { var x = by[c.church] || (by[c.church] = { church: c.church, region: c.region, cnt: 0, sum: 0, per: {} });
        x.per[c.walk_no] = c.adults + c.minors; x.cnt++; x.sum += c.adults + c.minors; if (!x.region && c.region) x.region = c.region; });
      var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (x) { return hit(x.church); })
        .sort(function (a, b) { return b.cnt - a.cnt || b.sum - a.sum || a.church.localeCompare(b.church, 'ko'); });
      $('wkCount').textContent = '교회 ' + list.length + '곳';
      $('wkSum').innerHTML = '<p class="m-help" style="margin:0 0 10px">칸의 숫자는 그 회차 참가 인원(성인 + 미성년)입니다. 여러 해 함께한 교회부터 보입니다.</p>';
      $('wkTable').innerHTML = '<tr><th>교회</th><th>지역</th>' + runs.map(function (r) { return '<th style="text-align:right">제' + r.walk_no + '회</th>'; }).join('') +
        '<th style="text-align:right">참가 횟수</th></tr>' +
        (list.map(function (x) { return '<tr><td><b>' + esc(x.church) + '</b></td><td>' + esc(x.region || '') + '</td>' +
          runs.map(function (r) { var n = x.per[r.walk_no]; return '<td style="text-align:right">' + (n != null ? n0(n) : '<span style="color:var(--faint)">–</span>') + '</td>'; }).join('') +
          '<td style="text-align:right"><b>' + x.cnt + '회</b></td></tr>'; }).join('') || '<tr><td colspan="' + (runs.length + 3) + '">찾는 교회가 없습니다.</td></tr>');
      return;
    }
    var run = RUNS.filter(function (r) { return String(r.walk_no) === v; })[0] || RUNS[0];
    var rows = WCH.filter(function (c) { return c.walk_no === run.walk_no && hit(c.church); })
      .sort(function (a, b) { return (b.adults + b.minors) - (a.adults + a.minors) || a.church.localeCompare(b.church, 'ko'); });
    var t = rows.reduce(function (s, c) { s.apps += c.apps; s.a += c.adults; s.m += c.minors; return s; }, { apps: 0, a: 0, m: 0 });
    $('wkCount').textContent = '교회 ' + rows.length + '곳';
    $('wkSum').innerHTML = '<h2 class="wk-h">' + esc(run.title || ('제' + run.walk_no + '회 3·1 만세길 걷기')) + '</h2>' +
      '<p class="m-help" style="margin:0 0 12px">' + [run.event_date ? dot(run.event_date) : '', run.place || ''].filter(Boolean).map(esc).join(' · ') +
      (run.past ? ' · 교회별 인원만 남은 지난 기록' : ' · <a href="walk-admin.html?e=' + encodeURIComponent(run.event) + '">신청 상세 기록 →</a>') + '</p>' +
      '<div class="wk-kpis"><div><b>' + rows.length + '</b><span>참가 교회</span></div><div><b>' + n0(t.a + t.m) + '</b><span>참가 인원</span></div>' +
      '<div><b>' + n0(t.a) + '</b><span>성인</span></div><div><b>' + n0(t.m) + '</b><span>미성년</span></div><div><b>' + n0(t.apps) + '</b><span>신청 건수</span></div></div>';
    $('wkTable').innerHTML = '<tr><th style="width:44px;text-align:center">순</th><th>교회</th><th>지역</th><th style="text-align:right">신청</th><th style="text-align:right">성인</th><th style="text-align:right">미성년</th><th style="text-align:right">합계</th></tr>' +
      (rows.map(function (c, i) { return '<tr><td style="text-align:center;color:var(--muted)">' + (i + 1) + '</td><td><b>' + esc(c.church) + '</b></td><td>' + esc(c.region || '') + '</td>' +
        '<td style="text-align:right">' + n0(c.apps) + '</td><td style="text-align:right">' + n0(c.adults) + '</td><td style="text-align:right">' + n0(c.minors) + '</td><td style="text-align:right"><b>' + n0(c.adults + c.minors) + '</b></td></tr>'; }).join('') ||
        '<tr><td colspan="7">찾는 교회가 없습니다.</td></tr>') +
      (rows.length ? '<tr class="wk-total"><td></td><td><b>합계</b></td><td></td><td style="text-align:right"><b>' + n0(t.apps) + '</b></td><td style="text-align:right"><b>' + n0(t.a) + '</b></td><td style="text-align:right"><b>' + n0(t.m) + '</b></td><td style="text-align:right"><b>' + n0(t.a + t.m) + '</b></td></tr>' : '');
  }
})();
