// ============================================================
//  옛 자료 옮기기 (move.html) — 10월 27일 전에 쓰던 옛 Supabase 프로젝트 → 새 manse 프로젝트
//  · 새 쪽: 지금 로그인한 대표회장 · 서기 · 최고관리자 (my_perms().manager)
//  · 옛 쪽: 옛 홈페이지 계정으로 로그인 (비밀번호 재설정 메일 지원 — 메일에서 돌아오면 이 화면에서 새 비밀번호)
//  · 옮기는 것: 임원 명단 · 공문/자료(파일 포함) · 활동 기록 · 사진(파일 포함) · 영상 · 걷기 참가 교회 · 회계 장부
//    처음 넣은 활동 사진(저장소 경로 '…/s-파일')은 홈페이지 파일로 이미 보이므로 건너뜀
//  · 옛 자료는 그대로 두고 복사만, 이미 있는 것은 건너뜀 (다시 눌러도 안전 — 멈춘 곳부터 이어서)
// ============================================================
(function () {
  var OLD_URL = 'https://elaockhopuvadamvwjeg.supabase.co';
  var OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsYW9ja2hvcHV2YWRhbXZ3amVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MTAyNzYsImV4cCI6MjEwNjI4NjI3Nn0.u5sFXiKFBWTK4CG2ifB_MInBAhJnUJptMNdrYjk-b-4'; // 옛 프로젝트 anon(공개) 키
  var $ = function (id) { return document.getElementById(id); }, esc = window.mEsc;
  var neo = window.msb, old = null, me = null, OLD = null, NEW = null, busy = false;

  function errText(e) {
    var m = (e && (e.message || e.error_description || e.msg)) || String(e || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '옛 저장소에 연결되지 않습니다. 인터넷 연결을 확인하고, 계속 안 되면 옛 프로젝트가 일시 정지되었거나 지워졌을 수 있습니다.';
    if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않습니다.';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 안 된 계정입니다.';
    if (/rate limit|too many/i.test(m)) return '요청이 너무 많습니다. 잠시 뒤에 다시 해 주세요.';
    if (/should be different|same password/i.test(m)) return '전과 다른 비밀번호를 넣어 주세요.';
    return window.mErr ? window.mErr(e) : m;
  }
  function say(id, cls, html) { var el = $(id); el.className = 'm-msg' + (cls ? ' ' + cls : ''); el.innerHTML = html || ''; }
  function on(id) { $(id).classList.remove('off'); }
  function n0(v) { return Number(v || 0).toLocaleString('ko-KR'); }
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
  function set(list, f) { var s = {}; (list || []).forEach(function (x) { s[f(x)] = 1; }); return s; }
  function missing(e) { return !!e && (/42P01|PGRST205/.test(e.code || '') || /does not exist|schema cache/i.test(e.message || '')); }

  // 표 하나를 1000줄씩 끝까지 (표가 없으면 null)
  async function all(c, table, order) {
    var out = [], from = 0;
    for (;;) {
      var q = c.from(table).select('*');
      order.forEach(function (o) { q = q.order(o); });
      var r = await q.range(from, from + 999);
      if (r.error) { if (missing(r.error)) return null; throw r.error; }
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < 1000) return out;
      from += 1000;
    }
  }
  async function read(c) {
    var r = await Promise.all([
      all(c, 'officers', ['id']), all(c, 'docs', ['id']), all(c, 'activities', ['id']),
      all(c, 'activity_photos', ['id']), all(c, 'activity_videos', ['id']),
      all(c, 'walk_runs', ['walk_no']), all(c, 'walk_churches', ['walk_no', 'church']),
      all(c, 'ledger_entries', ['id']), all(c, 'ledger_years', ['year'])
    ]);
    return { officers: r[0], docs: r[1], activities: r[2], photos: r[3], videos: r[4], walks: r[5], churches: r[6], ledger: r[7], years: r[8] };
  }

  // ---------- 무엇을 옮길지 ----------
  var OFF_FILL = ['email', 'church', 'phone', 'term'];
  function lc(s) { return String(s || '').trim().toLowerCase(); }
  function findOfficer(list, x) {
    return (list || []).filter(function (n) { return lc(x.email) && lc(n.email) === lc(x.email); })[0]
        || (list || []).filter(function (n) { return n.name === x.name; })[0] || null;
  }
  function fillFor(o, n) {   // 새 명단에 비어 있는 칸만 옛 값으로
    var p = {}; OFF_FILL.forEach(function (k) { if (!n[k] && o[k]) p[k] = o[k]; });
    return Object.keys(p).length ? p : null;
  }
  function isFirstPhoto(p) { return !/^a-/.test(p.event_key || '') && /\/s-[^\/]+$/.test(p.path || ''); }
  function plan() {
    var o = OLD, n = NEW, P = { offAdd: [], offFill: [] };
    (o.officers || []).forEach(function (x) {
      var m = findOfficer(n.officers, x);
      if (!m) P.offAdd.push(x); else { var f = fillFor(x, m); if (f) P.offFill.push({ id: m.id, name: x.name, patch: f }); }
    });
    var dp = set(n.docs, function (d) { return d.path || (d.year + '|' + d.category + '|' + d.title); });
    P.docs = (o.docs || []).filter(function (d) { return !dp[d.path || (d.year + '|' + d.category + '|' + d.title)]; });
    var ai = set(n.activities, function (a) { return a.id; });
    P.activities = (o.activities || []).filter(function (a) { return !ai[a.id]; });
    var pp = set(n.photos, function (p) { return p.path; });
    P.firstPhotos = (o.photos || []).filter(isFirstPhoto).length;
    P.photos = (o.photos || []).filter(function (p) { return !isFirstPhoto(p) && !pp[p.path]; });
    var vv = set(n.videos, function (v) { return v.event_key + '|' + v.yt_id; });
    P.videos = (o.videos || []).filter(function (v) { return !vv[v.event_key + '|' + v.yt_id]; });
    var ww = set(n.walks, function (w) { return w.walk_no; });
    P.walks = (o.walks || []).filter(function (w) { return !ww[w.walk_no]; });
    var li = set(n.ledger, function (e) { return e.id; });
    P.ledger = (o.ledger || []).filter(function (e) { return !li[e.id]; });
    var yy = set(n.years, function (y) { return y.year; });
    P.years = (o.years || []).filter(function (y) { return !yy[y.year]; });
    P.total = P.offAdd.length + P.offFill.length + P.docs.length + P.activities.length + P.photos.length + P.videos.length + P.walks.length + P.ledger.length + P.years.length;
    return P;
  }
  function cnt(list) { return list == null ? '<span style="color:var(--faint)">없음</span>' : n0(list.length); }
  function drawScan(P) {
    var rows = [
      ['임원 명단', OLD.officers, NEW.officers, P.offAdd.length + (P.offFill.length ? ' <small>+ 빈 칸 채우기 ' + P.offFill.length + '</small>' : '')],
      ['공문 · 자료 (파일 포함)', OLD.docs, NEW.docs, P.docs.length],
      ['활동 기록', OLD.activities, NEW.activities, P.activities.length],
      ['활동 사진', OLD.photos, NEW.photos, P.photos.length + (P.firstPhotos ? ' <small>(처음 사진 ' + P.firstPhotos + '장은 이미 보임)</small>' : '')],
      ['활동 영상 (유튜브)', OLD.videos, NEW.videos, P.videos.length],
      ['걷기 참가 교회 (회차)', OLD.walks, NEW.walks, P.walks.length],
      ['회계 장부', OLD.ledger, NEW.ledger, P.ledger.length + (P.years.length ? ' <small>+ 이월 ' + P.years.length + '해</small>' : '')]
    ];
    $('scan').innerHTML = '<table><tr><th>항목</th><th class="r">옛 홈페이지</th><th class="r">새 홈페이지</th><th class="r">옮길 것</th></tr>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="r">' + cnt(r[1]) + '</td><td class="r">' + cnt(r[2]) + '</td><td class="r todo">' + r[3] + '</td></tr>'; }).join('') + '</table>';
    $('goAll').hidden = false; $('goAll').disabled = !P.total;
    $('goAll').textContent = P.total ? '모두 옮기기 (' + n0(P.total) + '건)' : '옮길 것이 없습니다 — 모두 옮겼습니다';
  }
  async function scan() {
    $('scan').innerHTML = '<p class="st">옛 홈페이지와 새 홈페이지의 자료를 세는 중…</p>'; $('goAll').hidden = true;
    try {
      var r = await Promise.all([read(old), read(neo)]); OLD = r[0]; NEW = r[1];
      drawScan(plan());
    } catch (ex) { $('scan').innerHTML = '<p class="st" style="color:var(--bad)">자료를 읽지 못했습니다: ' + esc(errText(ex)) + '</p>'; }
  }

  // ---------- 옮기기 ----------
  var done = 0, total = 0, fails = 0;
  function tick(label) { done++; $('bar').firstChild.style.width = Math.round(done / Math.max(1, total) * 100) + '%'; $('prog').textContent = label + ' (' + n0(done) + ' / ' + n0(total) + ')'; }
  function log(s) { var el = $('log'); el.hidden = false; el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; }
  function fail(what, ex) { fails++; log('못 옮김 — ' + what + ': ' + errText(ex)); }
  async function copyFile(bucket, path) {
    var d = await old.storage.from(bucket).download(path);
    if (d.error) throw new Error('옛 파일을 받지 못했습니다 (' + path + ') ' + errText(d.error));
    var u = await neo.storage.from(bucket).upload(path, d.data, { contentType: d.data.type || undefined, upsert: false });
    if (u.error && !/exist|duplicate/i.test(u.error.message || '') && String(u.error.statusCode) !== '409') throw new Error('새 저장소에 올리지 못했습니다 (' + path + ') ' + errText(u.error));
  }
  async function insertOne(table, row) { var r = await neo.from(table).insert(row); if (r.error) throw r.error; }
  async function pool(items, n, fn) {   // 한 번에 n개씩
    var i = 0;
    async function worker() { while (i < items.length) { var x = items[i++]; await fn(x); } }
    var ws = []; for (var k = 0; k < Math.min(n, items.length); k++) ws.push(worker());
    await Promise.all(ws);
  }
  async function moveAll() {
    if (busy) return; var P = plan(); if (!P.total) return;
    busy = true; $('goAll').disabled = true; done = 0; fails = 0; total = P.total;
    $('bar').hidden = false; $('log').textContent = ''; $('log').hidden = true;
    var ok = 0;
    // 1) 임원 명단
    for (var a = 0; a < P.offAdd.length; a++) {
      var o = P.offAdd[a];
      try { await insertOne('officers', pick(o, ['name', 'role', 'email', 'church', 'phone', 'term', 'sort', 'note', 'active'])); ok++; }
      catch (ex) { fail('임원 ' + o.name, ex); }
      tick('임원 명단');
    }
    for (var b = 0; b < P.offFill.length; b++) {
      var f = P.offFill[b];
      try { var u = await neo.from('officers').update(f.patch).eq('id', f.id); if (u.error) throw u.error; ok++; }
      catch (ex) { fail('임원 ' + f.name + ' 빈 칸 채우기', ex); }
      tick('임원 명단');
    }
    // 2) 공문 · 자료 — 파일 먼저, 그다음 목록
    await pool(P.docs, 3, async function (d) {
      try {
        if (d.path) await copyFile('manse-docs', d.path);
        if (d.orig_path) await copyFile('manse-docs', d.orig_path);
        await insertOne('docs', Object.assign(pick(d, ['year', 'category', 'title', 'doc_date', 'date_text', 'doc_no', 'note', 'path', 'mime', 'size', 'orig_path', 'orig_name', 'sensitive', 'uploader_name', 'created_at']), { uploaded_by: me.id }));
        ok++;
      } catch (ex) { fail('자료 "' + d.title + '"', ex); }
      tick('공문 · 자료');
    });
    // 3) 활동 기록 (같은 id 그대로 — 사진 · 영상이 'a-<id>'로 이어짐)
    for (var c = 0; c < P.activities.length; c++) {
      var ac = P.activities[c];
      try { await insertOne('activities', Object.assign(pick(ac, ['id', 'date', 'title', 'cat', 'place', 'people', 'walk', 'summary', 'creator_name', 'created_at']), { created_by: me.id })); ok++; }
      catch (ex) { fail('활동 기록 "' + ac.title + '"', ex); }
      tick('활동 기록');
    }
    // 4) 활동 사진
    await pool(P.photos, 4, async function (p) {
      try {
        await copyFile('manse-photos', p.path);
        if (p.thumb_path && p.thumb_path !== p.path) await copyFile('manse-photos', p.thumb_path);
        await insertOne('activity_photos', Object.assign(pick(p, ['event_key', 'path', 'thumb_path', 'w', 'h', 'caption', 'sort', 'uploader_name', 'created_at']), { uploaded_by: me.id }));
        ok++;
      } catch (ex) { fail('사진 ' + p.path, ex); }
      tick('활동 사진');
    });
    // 5) 활동 영상
    for (var v = 0; v < P.videos.length; v++) {
      var vd = P.videos[v];
      try { await insertOne('activity_videos', Object.assign(pick(vd, ['event_key', 'yt_id', 'title', 'sort', 'adder_name', 'created_at']), { added_by: me.id })); ok++; }
      catch (ex) { fail('영상 ' + vd.yt_id, ex); }
      tick('활동 영상');
    }
    // 6) 걷기 참가 교회 — 이관 함수로 회차째
    for (var w = 0; w < P.walks.length; w++) {
      var run = P.walks[w];
      var rows = (OLD.churches || []).filter(function (x) { return x.walk_no === run.walk_no; }).map(function (x) { return pick(x, ['church', 'region', 'apps', 'adults', 'minors']); });
      try {
        var r = await neo.rpc('walk_import', { p_walk_no: run.walk_no, p_event_key: run.event_key || null, p_title: run.title || null, p_date: run.event_date || null,
          p_place: run.place || null, p_rows: rows, p_by_name: run.sent_by_name || '옛 홈페이지' });
        if (r.error) throw r.error; ok++;
      } catch (ex) { fail('걷기 제' + run.walk_no + '회 참가 교회', ex); }
      tick('걷기 참가 교회');
    }
    // 7) 회계 장부 (같은 id 그대로) · 전기이월
    for (var e = 0; e < P.ledger.length; e++) {
      var le = P.ledger[e];
      try { await insertOne('ledger_entries', pick(le, ['id', 'entry_date', 'kind', 'category', 'description', 'amount', 'method', 'counterpart', 'memo', 'created_at', 'created_by_name', 'updated_at', 'updated_by_name'])); ok++; }
      catch (ex) { fail('장부 ' + le.entry_date + ' ' + le.description, ex); }
      tick('회계 장부');
    }
    for (var y = 0; y < P.years.length; y++) {
      var yr = P.years[y];
      try { await insertOne('ledger_years', pick(yr, ['year', 'opening_balance', 'note', 'updated_by_name'])); ok++; }
      catch (ex) { fail(yr.year + '년 전기이월', ex); }
      tick('전기이월');
    }
    busy = false;
    $('prog').innerHTML = fails
      ? '<b>' + n0(ok) + '건 옮겼고 ' + n0(fails) + '건은 못 옮겼습니다.</b> 아래 기록을 확인하고 <b>다시 누르면</b> 못 옮긴 것만 다시 합니다.'
      : '<b>다 옮겼습니다 (' + n0(ok) + '건).</b> 관리자 메뉴에서 확인해 보세요.';
    await scan();
  }

  // ---------- 옛 홈페이지 로그인 ----------
  async function afterOldLogin() {
    var s = await old.auth.getSession(), u = s.data && s.data.session && s.data.session.user;
    if (!u) return false;
    $('oldForm').hidden = true; $('pwForm').hidden = true; $('oOutRow').hidden = false; say('oMsg', '', '');
    var p = null; try { var r = await old.rpc('my_perms'); if (!r.error) p = r.data; } catch (_) {}
    var who = !p ? '' : p.admin ? ' — 최고관리자' : p.manager ? ' — 운영임원' : p.officer ? ' — 임원 (개인정보 자료는 읽지 못합니다)' : ' — 임원이 아니어서 자료를 읽을 수 없습니다';
    $('oldSt').innerHTML = '<span class="chip ok">로그인됨</span> 옛 홈페이지에 <b>' + esc(u.email) + '</b>(으)로 로그인했습니다' + who + '.';
    on('c3'); await scan();
    return true;
  }
  async function start() {
    if (!neo || !window.supabase) { $('newSt').textContent = '로그인 기능을 불러오지 못했습니다. 새로 고쳐 주세요.'; return; }
    var u = await window.mRequireLogin(); if (!u) return;
    me = u; var p = await window.mPerms(true);
    if (!p.manager) { $('newSt').innerHTML = '<span class="chip bad">권한 없음</span> 대표회장 · 서기 · 최고관리자만 옮길 수 있습니다. (지금 로그인: ' + esc(u.email) + ')'; return; }
    $('newSt').innerHTML = '<span class="chip ok">확인됨</span> <b>' + esc(u.email) + '</b> · ' + (p.admin ? '최고관리자' : esc(p.role || '운영임원'));
    on('c2'); $('oEmail').value = u.email || '';
    old = window.supabase.createClient(OLD_URL, OLD_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'manse-old-auth' } });

    $('oldForm').addEventListener('submit', async function (e) {
      e.preventDefault(); if (busy) return;
      var em = $('oEmail').value.trim(), pw = $('oPw').value;
      if (!em || !pw) return say('oMsg', 'err', '이메일과 비밀번호를 넣어 주세요.');
      $('oGo').disabled = true; say('oMsg', 'info', '로그인하는 중…');
      try { var r = await old.auth.signInWithPassword({ email: em, password: pw }); if (r.error) throw r.error; $('oPw').value = ''; await afterOldLogin(); }
      catch (ex) { say('oMsg', 'err', esc(errText(ex))); }
      $('oGo').disabled = false;
    });
    $('oForgot').addEventListener('click', async function () {
      var em = $('oEmail').value.trim(); if (!em) return say('oMsg', 'err', '이메일을 먼저 넣어 주세요.');
      say('oMsg', 'info', '메일을 보내는 중…');
      try {
        var r = await old.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname }); if (r.error) throw r.error;
        say('oMsg', 'ok', '<b>' + esc(em) + '</b>로 옛 홈페이지 비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 누르면 이 화면으로 돌아와 새 비밀번호를 정합니다. (안 보이면 스팸함도 확인해 주세요)');
      } catch (ex) { say('oMsg', 'err', esc(errText(ex))); }
    });
    $('pwForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var a = $('nPw').value, b = $('nPw2').value;
      if (a.length < 8) return say('oMsg', 'err', '비밀번호는 8자 이상으로 해 주세요.');
      if (a !== b) return say('oMsg', 'err', '두 비밀번호가 다릅니다.');
      try { var r = await old.auth.updateUser({ password: a }); if (r.error) throw r.error; $('nPw').value = $('nPw2').value = ''; await afterOldLogin(); }
      catch (ex) { say('oMsg', 'err', esc(errText(ex))); }
    });
    $('oOut').addEventListener('click', async function () {
      if (busy) return;
      try { await old.auth.signOut({ scope: 'local' }); } catch (_) {}
      $('oldForm').hidden = false; $('oOutRow').hidden = true; $('c3').classList.add('off'); $('goAll').hidden = true;
      $('scan').innerHTML = '<p class="st">옛 홈페이지에 로그인하면 옮길 자료가 여기에 나옵니다.</p>';
      $('oldSt').innerHTML = '10월 27일 전에 만세운동본부 홈페이지에서 쓰던 <b>이메일 · 비밀번호</b>입니다 (삼괴연합회 비밀번호와 다를 수 있습니다).';
    });
    $('goAll').addEventListener('click', function () {
      if (!confirm('옛 홈페이지 자료를 새 홈페이지로 복사합니다. 옛 자료는 그대로 남고, 이미 있는 것은 건너뜁니다.\n\n계속할까요?')) return;
      moveAll().catch(function (ex) { busy = false; $('goAll').disabled = false; $('prog').textContent = '멈췄습니다: ' + errText(ex) + ' — 다시 누르면 이어서 옮깁니다.'; });
    });

    // 재설정 메일에서 돌아옴 (move.html 머리의 스크립트가 챙겨 둔 주소 뒤쪽)
    var h = window.__OLD_HASH;
    if (h) {
      var q = new URLSearchParams(h);
      if (q.get('error_description')) say('oMsg', 'err', '재설정 링크가 맞지 않거나 시간이 지났습니다. 아래에서 메일을 다시 받아 주세요. (' + esc(q.get('error_description')) + ')');
      else if (q.get('access_token') && q.get('refresh_token')) {
        try {
          var r = await old.auth.setSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token') });
          if (r.error) throw r.error;
          if (q.get('type') === 'recovery') { $('oldForm').hidden = true; $('pwForm').hidden = false; say('oMsg', '', ''); return; }
        } catch (ex) { say('oMsg', 'err', '재설정 링크로 들어오지 못했습니다: ' + esc(errText(ex))); }
      }
    }
    try { await afterOldLogin(); } catch (_) {}
  }
  start();
})();
