// ============================================================
//  삼일만세운동본부 임원방 — 공문·자료 아카이브 / 임원 명단 / 회원 관리 / 자료 올리기
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
  var DOCS = [], OFFICERS = [], MEMBERS = [];
  var state = { cat: '', year: '', q: '' };

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
    setupTabs(); setupDocs(); setupRoster(); setupUpload();
    loadDocs(); loadRoster(); if (perms.manager) loadMembers();
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
    var cats = $('fCats');
    cats.innerHTML = ['<button class="o-cat" data-cat="" aria-pressed="true">전체</button>'].concat(CATS.map(function (c) {
      return '<button class="o-cat" data-cat="' + esc(c) + '" aria-pressed="false">' + esc(c) + '</button>';
    })).join('');
    cats.addEventListener('click', function (e) {
      var b = e.target.closest('.o-cat'); if (!b) return;
      state.cat = b.dataset.cat;
      cats.querySelectorAll('.o-cat').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      renderDocs();
    });
    $('fYear').addEventListener('change', function () { state.year = this.value; renderDocs(); });
    $('fText').addEventListener('input', function () { state.q = this.value.trim().toLowerCase(); renderDocs(); });
    $('docList').addEventListener('click', onDocAction);
  }
  async function loadDocs() {
    var r = await window.msb.from('docs').select('*').order('year', { ascending: false }).order('doc_date', { ascending: false, nullsFirst: false }).order('date_text', { ascending: false });
    if (r.error) { $('docList').innerHTML = '<div class="o-empty">' + esc(window.mErr(r.error)) + '</div>'; return; }
    DOCS = r.data || [];
    var years = Array.from(new Set(DOCS.map(function (d) { return d.year; }))).sort(function (a, b) { return b - a; });
    $('fYear').innerHTML = '<option value="">전체 연도</option>' + years.map(function (y) { return '<option value="' + y + '">' + y + '년</option>'; }).join('');
    if (state.year) $('fYear').value = state.year;
    renderDocs();
  }
  function renderDocs() {
    var list = DOCS.filter(function (d) {
      if (state.cat && d.category !== state.cat) return false;
      if (state.year && String(d.year) !== state.year) return false;
      if (state.q && ((d.title || '') + ' ' + (d.doc_no || '') + ' ' + (d.note || '')).toLowerCase().indexOf(state.q) < 0) return false;
      return true;
    });
    $('docCount').textContent = list.length + ' / ' + DOCS.length + '건';
    if (!DOCS.length) { $('docList').innerHTML = '<div class="o-empty">아직 올린 자료가 없습니다. <b>자료 올리기</b> 탭에서 공문·자료를 올려 주세요.</div>'; return; }
    if (!list.length) { $('docList').innerHTML = '<div class="o-empty">조건에 맞는 자료가 없습니다.</div>'; return; }
    var byYear = {};
    list.forEach(function (d) { (byYear[d.year] = byYear[d.year] || []).push(d); });
    var html = '';
    Object.keys(byYear).sort(function (a, b) { return b - a; }).forEach(function (y) {
      var items = byYear[y];
      html += '<h2 class="o-year">' + y + '년 <small>' + items.length + '건</small></h2>';
      CATS.forEach(function (c) {
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
            (perms.manager ? '<button class="m-btn danger sm" data-act="del" data-id="' + d.id + '">삭제</button>' : '') + '</div></div>';
        });
        html += '</div>';
      });
    });
    $('docList').innerHTML = html;
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
  function setupUpload() {
    $('uCat').innerHTML = CATS.filter(function (c) { return perms.manager || c !== '명부·개인정보'; }).map(function (c) { return '<option>' + c + '</option>'; }).join('');
    $('uYear').value = new Date().getFullYear();
    $('upForm').addEventListener('submit', uploadOne);
    $('dirPick').addEventListener('change', pickFolder);
    $('bulkGo').addEventListener('click', runBulk);
    if ($('migGo')) $('migGo').addEventListener('click', runMigration);
    var dz = $('dropZone');
    if (dz) {
      ['dragenter', 'dragover'].forEach(function (t) { dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
      dz.addEventListener('dragleave', function () { dz.classList.remove('over'); });
      dz.addEventListener('drop', onDrop);
    }
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
  async function uploadOne(e) {
    e.preventDefault(); var msg = $('upMsg'); msg.className = 'm-msg';
    var year = parseInt($('uYear').value, 10), cat = $('uCat').value, title = $('uTitle').value.trim(), f = $('uFile').files[0], o = $('uOrig').files[0];
    var sens = perms.manager && ($('uSens').checked || cat === '명부·개인정보');
    if (!year || !title || !f) return note(msg, 'err', '연도·제목·열람용 파일을 입력해 주세요.');
    if (f.size > 50 * 1048576 || (o && o.size > 50 * 1048576)) return note(msg, 'err', '파일은 50MB 이하만 올릴 수 있습니다.');
    var btn = $('upForm').querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = '올리는 중…';
    try {
      var path = await putFile(f, year, cat, sens), orig = o ? await putFile(o, year, cat, sens) : null;
      var ds = $('uDate').value.trim();
      var row = await insertDoc({ year: year, category: cat, title: title, doc_date: toDate(ds), date_text: ds || null, doc_no: $('uNo').value.trim() || null,
        note: $('uNote').value.trim() || null, path: path, mime: f.type || MIME[extOf(f.name)] || null, size: f.size + (o ? o.size : 0),
        orig_path: orig, orig_name: o ? o.name : null, sensitive: !!sens, uploaded_by: me.id, uploader_name: profile.name || me.email });
      DOCS.unshift(row); loadDocs();
      note(msg, 'ok', '"' + title + '" 자료를 올렸습니다.');
      $('uTitle').value = ''; $('uNo').value = ''; $('uNote').value = ''; $('uFile').value = ''; $('uOrig').value = ''; $('uDate').value = '';
    } catch (ex) { note(msg, 'err', window.mErr(ex)); }
    btn.disabled = false; btn.textContent = '올리기';
  }

  // 폴더 일괄: manifest.json { "연도/종류/파일.pdf": {year, category, title, date, no, sensitive, orig, orig2} }
  //  - '임원방_업로드자료' 폴더: manifest 기준으로 연도·종류·제목 자동
  //  - 그냥 파일 여러 개: 왼쪽 '한 건 올리기'의 연도·종류로, 제목은 파일 이름으로 (같은 이름의 PDF+HWP는 한 건으로 묶음)
  var bulk = null;
  function pickFolder() {
    analyze(Array.from(this.files || []).map(function (f) { return { file: f, path: '/' + (f.webkitRelativePath || f.name) }; }));
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
    if (!perms.manager) return alert('한꺼번에 올리기는 대표회장·서기만 할 수 있습니다. 한 건 올리기를 이용해 주세요.');
    var out = [], items = Array.from(e.dataTransfer.items || []);
    var entries = items.map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }).filter(Boolean);
    if (entries.length) await Promise.all(entries.map(function (en) { return readEntry(en, out); }));
    else Array.from(e.dataTransfer.files || []).forEach(function (f) { out.push({ file: f, path: '/' + f.name }); });
    await analyze(out, true);
  }
  function baseName(n) { return n.replace(/\.[^.]+$/, ''); }
  async function analyze(list, autoStart) {
    list = list.filter(function (x) { return !/(^|\/)(\.|~\$|Thumbs\.db|desktop\.ini)/i.test(x.path); });
    var man = list.find(function (x) { return /(^|\/)manifest\.json$/.test(x.path); }), items;
    if (man) {
      var base = man.path.replace(/manifest\.json$/, ''), byRel = {};
      list.forEach(function (x) { if (x.path.indexOf(base) === 0) byRel[x.path.slice(base.length)] = x.file; });
      var mf = JSON.parse(await man.file.text());
      items = Object.keys(mf).map(function (rel) { var m = mf[rel]; m.rel = rel; m.file = byRel[rel]; m.origFile = m.orig ? byRel[m.orig] : null; return m; })
        .filter(function (m) { return m.file; });
    } else {
      var year = parseInt($('uYear').value, 10) || new Date().getFullYear(), cat = $('uCat').value, groups = {};
      list.forEach(function (x) { var k = baseName(x.file.name); (groups[k] = groups[k] || []).push(x.file); });
      items = Object.keys(groups).map(function (k) {
        var fs = groups[k], view = fs.find(function (f) { return /\.pdf$/i.test(f.name); }) || fs[0];
        var orig = fs.find(function (f) { return f !== view; }) || null;
        return { year: year, category: cat, title: k, date: '', no: '', sensitive: cat === '명부·개인정보', file: view, origFile: orig };
      });
    }
    var tooBig = items.filter(function (m) { return m.file.size > 50 * 1048576 || (m.origFile && m.origFile.size > 50 * 1048576); });
    items = items.filter(function (m) { return tooBig.indexOf(m) < 0; });
    var have = {}; DOCS.forEach(function (d) { have[d.year + '|' + d.category + '|' + d.title] = 1; });
    var todo = items.filter(function (m) { return !have[m.year + '|' + m.category + '|' + m.title]; });
    bulk = { items: todo };
    var sens = todo.filter(function (m) { return m.sensitive; }).length;
    $('bulkInfo').innerHTML = (man ? '정리된 폴더(manifest) 기준 · ' : '파일 ' + list.length + '개 → <b>' + esc($('uYear').value) + '년 · ' + esc($('uCat').value) + '</b>로 · ') +
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
        await insertDoc({ year: m.year, category: m.category, title: m.title, doc_date: toDate(m.date), date_text: m.date || null, doc_no: m.no || null,
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
})();
