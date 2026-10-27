// ============================================================
//  회계 관리 — 수입 · 지출 장부와 회계 보고 (삼기연 accounting.html · 삼일만세운동본부 관리자 메뉴 '회계' 탭 공용)
//  화면 모양만 같고, 기록은 각 단체의 Supabase(ledger_entries · ledger_years · ledger_log)에 따로 쌓입니다.
//  Ledger.mount(root, { client, org, canWrite, signers, cats, setupFile, setupPage, president })
//   - client   : 그 단체의 Supabase client
//   - canWrite : 기록 · 고치기 · 지우기 · 전기이월 넣기 단추를 보일지 (실제 권한은 서버 RLS가 판단)
//   - signers  : 보고서 서명란 (예: ['회계', '감사', '회장'])
//   - cats     : 계정과목 보기 { 수입: [...], 지출: [...] } — 이 밖의 과목도 직접 적을 수 있음
// ============================================================
(function () {
  var METHODS = ['계좌이체', '현금', '카드', '기타'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayK() { var d = new Date(Date.now() + 9 * 3600000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function dot(d) { return String(d || '').slice(0, 10).replace(/-/g, '.'); }
  function md(d) { var p = String(d || '').split('-'); return p.length === 3 ? (+p[1]) + '.' + (+p[2]) : d; }
  function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function stamp(iso) { var d = new Date(new Date(iso).getTime() + 9 * 3600000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function digits(s) { return String(s || '').replace(/[^\d]/g, ''); }
  function errText(e, setup) {
    var m = String((e && e.message) || e || '');
    if (/ledger_|schema cache|does not exist|could not find/i.test(m)) return 'Supabase SQL Editor에서 ' + setup + '을 먼저 실행해 주세요.';
    if (/row-level|permission|violates|not allowed/i.test(m)) return '권한이 없습니다. (기록은 회계만 할 수 있습니다)';
    if (/check constraint/i.test(m)) return '입력한 값을 다시 확인해 주세요. (금액은 1원 이상, 적요 · 계정과목은 꼭 적기)';
    return m || '알 수 없는 오류가 발생했습니다.';
  }

  function mount(root, o) {
    var sb = o.client, setup = o.setupFile || 'ledger-setup.sql', canWrite = !!o.canWrite;
    var S = { year: +todayK().slice(0, 4), period: 'all', from: '', to: '', entries: [], opening: null, openNote: '', edit: null, busy: false, years: [] };
    var CATS = { '수입': (o.cats && o.cats['수입']) || [], '지출': (o.cats && o.cats['지출']) || [] };
    var signers = o.signers || ['회계', '감사', '회장'];

    root.innerHTML =
      '<div class="lg">' +
      '<div class="lg-warn" data-k="warn" hidden></div>' +
      '<div class="lg-bar">' +
        '<label>연도 <select data-k="year"></select></label>' +
        '<label>기간 <select data-k="period"><option value="all">한 해 전체</option>' +
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return '<option value="' + m + '">' + m + '월</option>'; }).join('') +
          '<option value="range">직접 고르기</option></select></label>' +
        '<span class="lg-range" data-k="range" hidden><input type="date" data-k="from" aria-label="시작일"> ~ <input type="date" data-k="to" aria-label="끝날"></span>' +
        '<span class="lg-sp"></span>' +
        '<button type="button" class="lg-btn pri" data-k="print">회계 보고 인쇄</button>' +
        '<button type="button" class="lg-btn" data-k="csv">엑셀(CSV)</button>' +
      '</div>' +
      '<div class="lg-kpis" data-k="kpis"></div>' +
      '<div class="lg-open" data-k="open"></div>' +
      (canWrite ?
        '<form class="lg-form" data-k="form" novalidate>' +
          '<div class="lg-fh"><b data-k="fTitle">수입 · 지출 기록하기</b><span class="lg-msg" data-k="fMsg" role="status"></span></div>' +
          '<div class="lg-fg">' +
            '<label>날짜<input type="date" data-k="fDate" required></label>' +
            '<div class="lg-kind" role="radiogroup" aria-label="수입 · 지출"><button type="button" data-kind="수입" class="in">수입</button><button type="button" data-kind="지출" class="out">지출</button></div>' +
            '<label>계정과목<input data-k="fCat" list="lgCats" maxlength="40" placeholder="예: 회비 · 행사비" required><datalist id="lgCats"></datalist></label>' +
            '<label>금액(원)<input data-k="fAmt" inputmode="numeric" maxlength="16" placeholder="예: 100,000" required></label>' +
            '<label class="w2">적요 (무엇에 대한 돈인지)<input data-k="fDesc" maxlength="200" placeholder="예: 10월 회비 — 조암교회" required></label>' +
            '<label>방법<select data-k="fMethod"><option value="">(고르기)</option>' + METHODS.map(function (m) { return '<option>' + m + '</option>'; }).join('') + '</select></label>' +
            '<label>거래처 · 낸 사람<input data-k="fWho" maxlength="80" placeholder="선택"></label>' +
            '<label class="w2">비고<input data-k="fMemo" maxlength="300" placeholder="선택 · 영수증 번호 등"></label>' +
          '</div>' +
          '<div class="lg-fa"><button type="submit" class="lg-btn pri big" data-k="fSave">기록하기</button><button type="button" class="lg-btn" data-k="fCancel" hidden>고치기 그만</button></div>' +
        '</form>' : '<p class="lg-ro">보기 전용입니다. 수입 · 지출 기록은 회계가 합니다.</p>') +
      '<div class="lg-grid"><section><h3>계정과목별</h3><div data-k="cats"></div></section><section data-k="monthsWrap"><h3>월별</h3><div data-k="months"></div></section></div>' +
      '<h3 class="lg-h3">거래 내역 <small data-k="count"></small></h3>' +
      '<div class="lg-tools"><input type="search" data-k="q" placeholder="적요 · 계정과목 · 거래처 찾기"><select data-k="fkind"><option value="">수입 · 지출 모두</option><option>수입</option><option>지출</option></select></div>' +
      '<div class="lg-tw" data-k="list"><div class="lg-empty">불러오는 중…</div></div>' +
      '<details class="lg-log" data-k="logBox"><summary>변경 기록 — 누가 언제 넣고 · 고치고 · 지웠는지</summary><div data-k="log"></div></details>' +
      '</div>';
    var $ = function (k) { return root.querySelector('[data-k="' + k + '"]'); };
    var kind = '수입';
    function setKind(k) { kind = k; root.querySelectorAll('.lg-kind button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-kind') === k); }); fillCats(); }
    function fillCats() {
      if (!canWrite) return;
      var used = {}; S.entries.forEach(function (e) { if (e.kind === kind) used[e.category] = 1; });
      var list = CATS[kind].concat(Object.keys(used).filter(function (c) { return CATS[kind].indexOf(c) < 0; }));
      root.querySelector('#lgCats').innerHTML = list.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
    }
    // 설치가 안 된 경우에는 설치 SQL 복사 페이지(o.setupPage)로 가는 링크를 붙임
    function warn(t) {
      var w = $('warn'); w.hidden = !t; w.textContent = t || '';
      if (t && o.setupPage && /SQL Editor/.test(t)) w.insertAdjacentHTML('beforeend', ' <a href="' + esc(o.setupPage) + '" style="font-weight:700;text-decoration:underline">설치 SQL 복사 페이지 열기 →</a>');
    }
    function fmsg(t, ok) { var m = $('fMsg'); if (!m) return; m.className = 'lg-msg' + (ok ? ' ok' : ''); m.textContent = t || ''; }

    // ---------- 기간 ----------
    function range() {
      var y = S.year;
      if (S.period === 'all') return { from: y + '-01-01', to: y + '-12-31', label: y + '년 한 해 (' + y + '.01.01 ~ ' + y + '.12.31)', all: true };
      if (S.period === 'range') {
        var f = S.from || y + '-01-01', t = S.to || y + '-12-31'; if (f > t) { var x = f; f = t; t = x; }
        return { from: f, to: t, label: dot(f) + ' ~ ' + dot(t) };
      }
      var m = +S.period;
      return { from: y + '-' + pad(m) + '-01', to: y + '-' + pad(m) + '-' + pad(lastDay(y, m)), label: y + '년 ' + m + '월 (' + y + '.' + pad(m) + '.01 ~ ' + y + '.' + pad(m) + '.' + pad(lastDay(y, m)) + ')' };
    }
    // 기간 계산 — 그해 전기이월 + 기간 전까지의 차액 = 기간 처음 잔액
    function calc() {
      var R = range(), open = S.opening || 0, before = 0, rows = [], inc = 0, out = 0, bal;
      S.entries.forEach(function (e) {
        if (e.entry_date < R.from) { before += e.kind === '수입' ? +e.amount : -e.amount; return; }
        if (e.entry_date > R.to) return;
        rows.push(e);
      });
      bal = open + before; var start = bal;
      rows.forEach(function (e) { if (e.kind === '수입') { inc += +e.amount; bal += +e.amount; } else { out += +e.amount; bal -= +e.amount; } e._bal = bal; });
      var cats = { '수입': {}, '지출': {} };
      rows.forEach(function (e) { var c = cats[e.kind][e.category] || (cats[e.kind][e.category] = { n: 0, sum: 0 }); c.n++; c.sum += +e.amount; });
      var months = [];
      if (R.all) { var b = open; for (var m = 1; m <= 12; m++) { var mi = 0, mo = 0; rows.forEach(function (e) { if (+e.entry_date.slice(5, 7) === m) { if (e.kind === '수입') mi += +e.amount; else mo += +e.amount; } }); b += mi - mo; months.push({ m: m, inc: mi, out: mo, bal: b }); } }
      return { R: R, rows: rows, start: start, inc: inc, out: out, end: bal, cats: cats, months: months };
    }

    // ---------- 그리기 ----------
    function draw() {
      var C = calc(), R = C.R;
      $('kpis').innerHTML =
        '<div><span>' + (R.all ? '전기이월 (1월 1일)' : '기간 처음 잔액') + '</span><b>' + won(C.start) + '<small>원</small></b></div>' +
        '<div class="in"><span>수입</span><b>' + won(C.inc) + '<small>원</small></b></div>' +
        '<div class="out"><span>지출</span><b>' + won(C.out) + '<small>원</small></b></div>' +
        '<div class="bal"><span>' + (R.all ? '차기이월 (잔액)' : '기간 끝 잔액') + '</span><b>' + won(C.end) + '<small>원</small></b></div>';
      drawOpen();
      $('cats').innerHTML = catTables(C);
      $('monthsWrap').hidden = !R.all; if (R.all) $('months').innerHTML = monthTable(C);
      var q = $('q').value.trim(), fk = $('fkind').value;
      var list = C.rows.filter(function (e) { return (!fk || e.kind === fk) && (!q || [e.category, e.description, e.counterpart, e.memo, e.method].join(' ').indexOf(q) >= 0); });
      $('count').textContent = R.label + ' · ' + list.length + '건';
      $('list').innerHTML = list.length ? '<table class="lg-t"><thead><tr><th>날짜</th><th>구분</th><th>계정과목</th><th>적요</th><th class="r">수입</th><th class="r">지출</th><th class="r">잔액</th>' + (canWrite ? '<th class="c">관리</th>' : '') + '</tr></thead><tbody>' +
        list.map(function (e) {
          return '<tr><td class="nw">' + md(e.entry_date) + '</td><td><span class="lg-chip ' + (e.kind === '수입' ? 'in' : 'out') + '">' + e.kind + '</span></td><td>' + esc(e.category) + '</td>' +
            '<td class="desc">' + esc(e.description) + ((e.counterpart || e.method || e.memo) ? '<small>' + esc([e.counterpart, e.method, e.memo].filter(Boolean).join(' · ')) + '</small>' : '') + '</td>' +
            '<td class="r">' + (e.kind === '수입' ? won(e.amount) : '') + '</td><td class="r">' + (e.kind === '지출' ? won(e.amount) : '') + '</td><td class="r b">' + won(e._bal) + '</td>' +
            (canWrite ? '<td class="c nw"><button type="button" class="lg-lnk" data-edit="' + e.id + '">고치기</button><button type="button" class="lg-lnk del" data-del="' + e.id + '">지우기</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table>'
        : '<div class="lg-empty">' + (C.rows.length ? '찾는 기록이 없습니다.' : R.label + '에는 아직 기록이 없습니다.' + (canWrite ? ' 위에서 수입 · 지출을 기록하세요.' : '')) + '</div>';
    }
    function catTables(C) {
      function one(k) {
        var keys = Object.keys(C.cats[k]).sort(function (a, b) { return C.cats[k][b].sum - C.cats[k][a].sum; }), tot = 0;
        keys.forEach(function (c) { tot += C.cats[k][c].sum; });
        return '<table class="lg-t sm"><thead><tr><th>' + k + ' 계정과목</th><th class="r">건수</th><th class="r">금액</th></tr></thead><tbody>' +
          (keys.map(function (c) { return '<tr><td>' + esc(c) + '</td><td class="r">' + C.cats[k][c].n + '</td><td class="r">' + won(C.cats[k][c].sum) + '</td></tr>'; }).join('') || '<tr><td colspan="3" class="lg-dim">없음</td></tr>') +
          '</tbody><tfoot><tr><td>' + k + ' 합계</td><td></td><td class="r">' + won(tot) + '</td></tr></tfoot></table>';
      }
      return '<div class="lg-2">' + one('수입') + one('지출') + '</div>';
    }
    function monthTable(C) {
      return '<table class="lg-t sm"><thead><tr><th>월</th><th class="r">수입</th><th class="r">지출</th><th class="r">차액</th><th class="r">월말 잔액</th></tr></thead><tbody>' +
        C.months.map(function (x) { var d = x.inc - x.out; return '<tr' + (x.inc || x.out ? '' : ' class="lg-dim"') + '><td>' + x.m + '월</td><td class="r">' + won(x.inc) + '</td><td class="r">' + won(x.out) + '</td><td class="r' + (d < 0 ? ' neg' : '') + '">' + (d > 0 ? '+' : '') + won(d) + '</td><td class="r">' + won(x.bal) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>합계</td><td class="r">' + won(C.inc) + '</td><td class="r">' + won(C.out) + '</td><td class="r">' + ((C.inc - C.out) > 0 ? '+' : '') + won(C.inc - C.out) + '</td><td class="r">' + won(C.end) + '</td></tr></tfoot></table>';
    }
    function drawOpen() {
      var y = S.year, has = S.opening !== null;
      $('open').innerHTML = '<span>' + y + '년 전기이월 (작년에서 넘어온 돈): <b>' + (has ? won(S.opening) + '원' : '아직 안 넣음 (0원으로 계산)') + '</b>' + (S.openNote ? ' · ' + esc(S.openNote) : '') + '</span>' +
        (canWrite ? ' <button type="button" class="lg-lnk" data-k="openEdit">' + (has ? '고치기' : '넣기') + '</button>' : '');
      var b = $('openEdit'); if (b) b.onclick = openEditor;
    }
    async function openEditor() {
      var y = S.year, prev = await closingOf(y - 1);
      $('open').innerHTML = '<span>' + y + '년 전기이월</span> <input data-k="openAmt" inputmode="numeric" value="' + (S.opening !== null ? won(S.opening) : '') + '" placeholder="원"> ' +
        '<button type="button" class="lg-btn pri" data-k="openSave">저장</button>' +
        (prev !== null ? ' <button type="button" class="lg-btn" data-k="openPrev">' + (y - 1) + '년 잔액 ' + won(prev) + '원으로</button>' : '') +
        ' <button type="button" class="lg-lnk" data-k="openX">그만</button> <span class="lg-msg" data-k="openMsg"></span>';
      $('openX').onclick = drawOpen;
      if ($('openPrev')) $('openPrev').onclick = function () { $('openAmt').value = won(prev); };
      $('openAmt').oninput = function () { var neg = /^\s*-/.test(this.value), d = digits(this.value); this.value = (neg ? '-' : '') + (d ? won(+d) : ''); };
      $('openSave').onclick = async function () {
        var v = $('openAmt').value, d = digits(v), amt = (/^\s*-/.test(v) ? -1 : 1) * (+d || 0);
        var r = await sb.from('ledger_years').upsert({ year: y, opening_balance: amt }, { onConflict: 'year' }).select('year,opening_balance,note').single();
        if (r.error) { $('openMsg').textContent = '저장하지 못했습니다: ' + errText(r.error, setup); return; }
        S.opening = +r.data.opening_balance; S.openNote = r.data.note || ''; draw(); loadLog();
      };
    }
    // 그해 말 잔액 (그해 전기이월 + 그해 수입 − 지출). 기록도 이월도 없으면 null
    async function closingOf(y) {
      var a = await sb.from('ledger_years').select('opening_balance').eq('year', y).maybeSingle();
      var e = await sb.from('ledger_entries').select('kind,amount').gte('entry_date', y + '-01-01').lte('entry_date', y + '-12-31');
      if (e.error || (!a.data && !(e.data || []).length)) return null;
      return (a.data ? +a.data.opening_balance : 0) + (e.data || []).reduce(function (s, x) { return s + (x.kind === '수입' ? +x.amount : -x.amount); }, 0);
    }

    // ---------- 불러오기 ----------
    async function loadYears() {
      var cur = +todayK().slice(0, 4), first = cur;
      var a = await sb.from('ledger_entries').select('entry_date').order('entry_date').limit(1);
      if (a.error) throw a.error;
      if (a.data && a.data[0]) first = Math.min(first, +a.data[0].entry_date.slice(0, 4));
      var b = await sb.from('ledger_years').select('year');
      (b.data || []).forEach(function (r) { first = Math.min(first, r.year); });
      var last = Math.max(cur, S.year); S.years = []; for (var y = last; y >= first; y--) S.years.push(y);
      $('year').innerHTML = S.years.map(function (y) { return '<option value="' + y + '"' + (y === S.year ? ' selected' : '') + '>' + y + '년</option>'; }).join('');
    }
    async function loadYear() {
      var y = S.year, all = [], from = 0;
      for (;;) {
        var r = await sb.from('ledger_entries').select('*').gte('entry_date', y + '-01-01').lte('entry_date', y + '-12-31').order('entry_date').order('created_at').range(from, from + 999);
        if (r.error) throw r.error; all = all.concat(r.data || []); if (!r.data || r.data.length < 1000) break; from += 1000;
      }
      S.entries = all;
      var o = await sb.from('ledger_years').select('opening_balance,note').eq('year', y).maybeSingle();
      S.opening = o.data ? +o.data.opening_balance : null; S.openNote = (o.data && o.data.note) || '';
      fillCats(); draw();
    }
    async function loadLog() {
      var r = await sb.from('ledger_log').select('at,who_name,action,summary').order('at', { ascending: false }).limit(100);
      $('log').innerHTML = r.error ? '<p class="lg-dim">' + esc(errText(r.error, setup)) + '</p>' : ((r.data || []).length
        ? '<ul class="lg-loglist">' + r.data.map(function (x) { return '<li><span class="lg-dim">' + stamp(x.at) + '</span> <b>' + esc(x.who_name || '') + '</b> · ' + esc(x.action) + ' · ' + esc(String(x.summary || '').replace(/(-?\d{4,})원/g, function (_, n) { return won(+n) + '원'; })) + '</li>'; }).join('') + '</ul>'
        : '<p class="lg-dim">아직 변경 기록이 없습니다.</p>');
    }
    async function reload() {
      try { await loadYears(); await loadYear(); warn(''); loadLog(); }
      catch (ex) { warn(errText(ex, setup)); $('list').innerHTML = '<div class="lg-empty">' + esc(errText(ex, setup)) + '</div>'; }
    }

    // ---------- 기록하기 · 고치기 · 지우기 ----------
    function resetForm(keepDate) {
      var d = keepDate ? $('fDate').value : todayK();
      S.edit = null; $('form').reset(); $('fDate').value = d; setKind(kind);
      $('fTitle').textContent = '수입 · 지출 기록하기'; $('fSave').textContent = '기록하기'; $('fCancel').hidden = true;
    }
    if (canWrite) {
      $('fDate').value = todayK(); setKind('수입');
      root.querySelectorAll('.lg-kind button').forEach(function (b) { b.onclick = function () { setKind(b.getAttribute('data-kind')); }; });
      $('fAmt').addEventListener('input', function () { var d = digits(this.value); this.value = d ? won(+d) : ''; });
      $('fCancel').onclick = function () { resetForm(); fmsg(''); };
      $('form').addEventListener('submit', async function (e) {
        e.preventDefault(); if (S.busy) return;
        var row = { entry_date: $('fDate').value, kind: kind, category: $('fCat').value.trim(), description: $('fDesc').value.trim(), amount: +digits($('fAmt').value) || 0,
                    method: $('fMethod').value || null, counterpart: $('fWho').value.trim() || null, memo: $('fMemo').value.trim() || null };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date)) return fmsg('날짜를 골라 주세요.');
        if (!row.category) return fmsg('계정과목을 적어 주세요. (예: 회비 · 행사비)');
        if (!row.amount) return fmsg('금액을 적어 주세요.');
        if (!row.description) return fmsg('적요(무엇에 대한 돈인지)를 적어 주세요.');
        S.busy = true; $('fSave').disabled = true; fmsg('저장하는 중…', true);
        var r = S.edit ? await sb.from('ledger_entries').update(row).eq('id', S.edit).select('id') : await sb.from('ledger_entries').insert(row).select('id');
        S.busy = false; $('fSave').disabled = false;
        if (r.error || !r.data || !r.data.length) return fmsg('저장하지 못했습니다: ' + (r.error ? errText(r.error, setup) : '권한이 없습니다.'));
        var y = +row.entry_date.slice(0, 4), was = !!S.edit;
        fmsg((was ? '고쳤습니다' : '기록했습니다') + ' — ' + row.kind + ' ' + won(row.amount) + '원 · ' + row.category, true);
        resetForm(true);
        if (y !== S.year) { S.year = y; S.period = 'all'; $('period').value = 'all'; $('range').hidden = true; }
        await reload();
      });
      $('list').addEventListener('click', async function (e) {
        var ed = e.target.getAttribute('data-edit'), dl = e.target.getAttribute('data-del');
        var x = S.entries.filter(function (r) { return r.id === (ed || dl); })[0]; if (!x) return;
        if (ed) {
          S.edit = x.id; $('fDate').value = x.entry_date; setKind(x.kind); $('fCat').value = x.category; $('fAmt').value = won(x.amount); $('fDesc').value = x.description;
          $('fMethod').value = x.method || ''; $('fWho').value = x.counterpart || ''; $('fMemo').value = x.memo || '';
          $('fTitle').textContent = '기록 고치기 — ' + dot(x.entry_date) + ' ' + x.kind + ' ' + won(x.amount) + '원'; $('fSave').textContent = '고친 내용 저장'; $('fCancel').hidden = false; fmsg('');
          $('form').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (!confirm(dot(x.entry_date) + ' ' + x.kind + ' ' + won(x.amount) + '원 · ' + x.category + ' · ' + x.description + '\n\n이 기록을 지울까요? 지운 내용은 변경 기록에 남습니다.')) return;
        var r = await sb.from('ledger_entries').delete().eq('id', x.id).select('id');
        if (r.error || !r.data || !r.data.length) return alert('지우지 못했습니다: ' + (r.error ? errText(r.error, setup) : '권한이 없습니다.'));
        if (S.edit === x.id) resetForm();
        await reload();
      });
    }

    // ---------- 기간 · 찾기 ----------
    $('year').onchange = function () { S.year = +this.value; if (S.period === 'range') { S.from = ''; S.to = ''; $('from').value = ''; $('to').value = ''; } loadYear().catch(function (ex) { warn(errText(ex, setup)); }); };
    $('period').onchange = function () {
      S.period = this.value; $('range').hidden = S.period !== 'range';
      if (S.period === 'range') { if (!$('from').value) $('from').value = S.year + '-01-01'; if (!$('to').value) $('to').value = S.year + '-12-31'; S.from = $('from').value; S.to = $('to').value; }
      draw();
    };
    $('from').onchange = function () { S.from = this.value; draw(); };
    $('to').onchange = function () { S.to = this.value; draw(); };
    $('q').oninput = draw; $('fkind').onchange = draw;

    // ---------- 회계 보고 인쇄 · CSV ----------
    function reportHtml() {
      var C = calc(), R = C.R, now = todayK();
      return '<div class="lg-rep">' +
        '<div class="lg-rh"><p class="org">' + esc(o.org) + '</p><h1>' + (R.all ? S.year + '년 회계 보고' : '회계 보고') + '</h1><p>기간: ' + esc(R.label) + ' · 출력: ' + dot(now) + '</p></div>' +
        '<table class="lg-t sum"><thead><tr><th>' + (R.all ? '전기이월' : '처음 잔액') + '</th><th>수입</th><th>지출</th><th>' + (R.all ? '차기이월 (잔액)' : '끝 잔액') + '</th></tr></thead>' +
        '<tbody><tr><td>' + won(C.start) + '원</td><td>' + won(C.inc) + '원</td><td>' + won(C.out) + '원</td><td><b>' + won(C.end) + '원</b></td></tr></tbody></table>' +
        '<h2>계정과목별 수입 · 지출</h2>' + catTables(C) +
        (R.all ? '<h2>월별 수입 · 지출</h2>' + monthTable(C) : '') +
        '<h2>거래 내역 (' + C.rows.length + '건)</h2>' +
        (C.rows.length ? '<table class="lg-t"><thead><tr><th>날짜</th><th>구분</th><th>계정과목</th><th>적요</th><th>거래처 · 방법</th><th class="r">수입</th><th class="r">지출</th><th class="r">잔액</th></tr></thead><tbody>' +
          '<tr class="lg-dim"><td colspan="7">' + (R.all ? '전기이월' : '처음 잔액') + '</td><td class="r">' + won(C.start) + '</td></tr>' +
          C.rows.map(function (e) { return '<tr><td class="nw">' + dot(e.entry_date) + '</td><td>' + e.kind + '</td><td>' + esc(e.category) + '</td><td>' + esc(e.description) + (e.memo ? ' <small>(' + esc(e.memo) + ')</small>' : '') + '</td><td>' + esc([e.counterpart, e.method].filter(Boolean).join(' · ')) + '</td>' +
            '<td class="r">' + (e.kind === '수입' ? won(e.amount) : '') + '</td><td class="r">' + (e.kind === '지출' ? won(e.amount) : '') + '</td><td class="r">' + won(e._bal) + '</td></tr>'; }).join('') +
          '</tbody><tfoot><tr><td colspan="5">합계</td><td class="r">' + won(C.inc) + '</td><td class="r">' + won(C.out) + '</td><td class="r">' + won(C.end) + '</td></tr></tfoot></table>' : '<p>이 기간에는 거래가 없습니다.</p>') +
        '<div class="lg-end"><p class="lg-decl">위와 같이 회계를 보고합니다.<br>' + dot(now) + '</p>' +
        '<div class="lg-sign">' + signers.map(function (s) { return '<div><span>' + esc(s) + '</span><i></i><em>(인)</em></div>'; }).join('') + '</div></div>' +
        '</div>';
    }
    $('print').onclick = function () {
      var box = document.querySelector('.lg-print') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'lg-print' }));
      box.innerHTML = reportHtml();
      document.documentElement.classList.add('lg-printing');
      var done = function () { document.documentElement.classList.remove('lg-printing'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
      setTimeout(done, 1500);
    };
    $('csv').onclick = function () {
      var C = calc(), lines = [['날짜', '구분', '계정과목', '적요', '수입', '지출', '잔액', '방법', '거래처 · 낸 사람', '비고', '기록한 사람']];
      lines.push([C.R.from, '', '', C.R.all ? '전기이월' : '처음 잔액', '', '', C.start, '', '', '', '']);
      C.rows.forEach(function (e) { lines.push([e.entry_date, e.kind, e.category, e.description, e.kind === '수입' ? e.amount : '', e.kind === '지출' ? e.amount : '', e._bal, e.method || '', e.counterpart || '', e.memo || '', e.updated_by_name || e.created_by_name || '']); });
      var csv = '﻿' + lines.map(function (l) { return l.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = o.org.replace(/\s/g, '') + '_회계_' + (C.R.all ? S.year + '년' : C.R.from + '_' + C.R.to) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    };

    reload();
    return { reload: reload };
  }
  window.Ledger = { mount: mount };
})();
