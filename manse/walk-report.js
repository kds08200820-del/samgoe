// ============================================================
//  삼일만세운동본부 관리자 메뉴 — 3·1 만세길 걷기 총괄 (officer.html 의 '걷기대회 관리' 탭)
//  - 걷기대회 관리 단추: 행운권 QR · 행사 · 신청 기록 · 경품 당첨자 명단 (이 홈페이지의 화면)
//  - 회차별 결과 보고: 참여 교회 · 단체 · 시민, 경품 당첨 · 인증 · 수령, 당첨자 명단 — 이름은 모두 가림 (홍*동)
//  - 'PDF로 자료실에 올리기': 같은 보고서를 PDF로 만들어 공문 · 자료(행사 운영)에 올림 → 만세운동본부 임원 누구나 열람
//  - '홈페이지에 게시': 숫자와 교회 이름만 walk_reports(manse-report-setup.sql)에 저장 → 첫 화면 '결과 보고' 띠 · report.html
//    (당첨자 명단은 빼고, 단체 · 시민은 소속 칸에 개인 이름이 적히기도 해서 이름 없이 곳 수만)
//  기록은 모두 만세운동본부 Supabase(manse-walk-setup.sql)에 있음 — 관리자 메뉴에 들어온 임원이면 읽힘
// ============================================================
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.mEsc || function (s) { return String(s == null ? '' : s); };
  var ctx = null, sg = null, EVENTS = [], DATA = null, busy = false;   // sg: 기록을 읽는 클라이언트 (만세운동본부 msb)

  function n0(v) { return Number(v || 0).toLocaleString('ko-KR'); }
  function dot(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[1] + '.' + m[2] + '.' + m[3] : ''; }
  function today() { var d = new Date(Date.now() + 9 * 3600000); return d.toISOString().slice(0, 10); }
  // 이름 가리기 — 홍길동 → 홍*동, 홍길 → 홍*, 남궁민수 → 남**수
  function mask(n) { n = Array.from(String(n || '').trim()); if (!n.length) return ''; return n.length <= 1 ? '*' : n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function kdate(ts) { var d = ts ? new Date(ts) : null; return d && !isNaN(d) ? dot(new Date(d.getTime() + 9 * 3600000).toISOString()) : ''; }

  // ---------- 기록 불러오기 ----------
  async function loadEvents() {
    EVENTS = window.WalkEv ? await window.WalkEv.list(sg) : [];
    if (!EVENTS.length) EVENTS = [{ event: '2026-6', no: 6, title: '제6회 3·1 만세길 걷기', event_date: '2026-10-18', place: '쌍봉산 근린공원' }];
    var sel = $('rpSel'), cur = sel.value;
    sel.innerHTML = EVENTS.map(function (e) { return '<option value="' + esc(e.event) + '">제' + e.no + '회' + (e.event_date ? ' · ' + dot(e.event_date) : '') + '</option>'; }).join('');
    // 처음엔 기록이 있는 가장 최근 회차 — 날짜가 지난 회차 중 맨 앞
    var past = EVENTS.filter(function (e) { return e.event_date && e.event_date <= today(); })[0];
    sel.value = cur && sel.querySelector('option[value="' + cur + '"]') ? cur : (past || EVENTS[0]).event;
  }
  async function all(q) {   // 1000줄씩 끝까지
    var out = [], from = 0;
    for (;;) { var r = await q().range(from, from + 999); if (r.error) throw r.error; out = out.concat(r.data || []); if (!r.data || r.data.length < 1000) return out; from += 1000; }
  }
  async function loadReport() {
    var code = $('rpSel').value, ev = EVENTS.filter(function (e) { return e.event === code; })[0];
    $('rpBody').innerHTML = '<div class="o-empty">불러오는 중…</div>';
    try {
      var r = await Promise.all([
        all(function () { return sg.from('walk_applications').select('name,church,adults,minors').eq('event', code).order('created_at'); }),
        all(function () { return sg.from('prize_winners').select('ticket,prize,seq').eq('event', code).order('seq').order('ticket'); }),
        all(function () { return sg.from('prize_claims').select('ticket,prize,name,church,batch_id,created_at').eq('event', code).order('ticket'); }),
        all(function () { return sg.from('prize_pickups').select('ticket,picked_at').eq('event', code); }).catch(function () { return []; }),
        all(function () { return sg.from('lucky_tickets').select('no,name,church,registered_at').eq('event', code).order('no'); }).catch(function () { return null; })
      ]);
      DATA = summarize(ev, { apps: r[0], winners: r[1], claims: r[2], pickups: r[3], lucky: r[4] });
      $('rpBody').innerHTML = screenHtml(DATA);
      $('rpPdf').disabled = false;
      await loadPub();
    } catch (ex) {
      DATA = null; $('rpPdf').disabled = true; $('rpPub').disabled = true; $('rpPubSt').hidden = true;
      $('rpBody').innerHTML = '<div class="o-empty">기록을 불러오지 못했습니다: ' + esc(window.mErr ? window.mErr(ex) : (ex && ex.message)) + '</div>';
    }
  }

  // ---------- 정리 (소속 · 경품 · 당첨자) ----------
  var CH = {}; (window.CHURCHES || []).forEach(function (c) { CH[c.name.replace(/\s/g, '')] = c; });
  function org(raw) {   // 소속 이름 맞추기 + 구분
    var t = String(raw || '').trim(), k = t.replace(/\s/g, ''), c = CH[k] || CH[k + '교회'];
    if (c) return { name: c.name, kind: '회원교회', region: c.region || '' };
    if (!k || /^(없음|무소속|개인|-|x)$/i.test(k)) return { name: '(소속 없음)', kind: '소속 없음', region: '' };
    return { name: t, kind: /교회$/.test(k) ? '그 밖의 교회' : '단체 · 시민', region: '' };
  }
  var KINDS = ['회원교회', '그 밖의 교회', '단체 · 시민', '소속 없음'];
  function summarize(ev, d) {
    var voids = {}, prizes = [], P = {}, wins = {};
    d.winners.forEach(function (w) {
      if (w.prize === '무효표') { voids[w.ticket] = 1; return; }
      if (!P[w.prize]) { P[w.prize] = { prize: w.prize, seq: w.seq, n: 0, claimed: 0, picked: 0 }; prizes.push(P[w.prize]); }
      P[w.prize].n++; (wins[w.ticket] = wins[w.ticket] || []).push(w.prize);
    });
    var claimBy = {}, batches = {}, picked = {}, lucky = {};
    d.claims.forEach(function (c) { claimBy[c.ticket] = c; batches[c.batch_id] = 1; });
    d.pickups.forEach(function (p) { picked[p.ticket] = 1; });
    (d.lucky || []).forEach(function (t) { if (t.name) lucky[t.no] = t; });
    Object.keys(wins).forEach(function (t) { wins[t].forEach(function (pz) { if (claimBy[t]) P[pz].claimed++; if (picked[t]) P[pz].picked++; }); });
    // 소속별: 참가 신청 인원 · 당첨 인증 장수 · 행운권 등록
    var O = {}, orgs = [];
    function O_(raw) { var o = org(raw); if (!O[o.name]) { O[o.name] = { name: o.name, kind: o.kind, region: o.region, people: 0, apps: 0, claimed: 0, picked: 0, lucky: 0 }; orgs.push(O[o.name]); } return O[o.name]; }
    d.apps.forEach(function (a) { var x = O_(a.church); x.apps++; x.people += (a.adults || 0) + (a.minors || 0); });
    d.claims.forEach(function (c) { var x = O_(c.church); x.claimed++; if (picked[c.ticket]) x.picked++; });
    Object.keys(lucky).forEach(function (no) { O_(lucky[no].church).lucky++; });
    orgs.sort(function (a, b) { return (b.people + b.claimed + b.lucky) - (a.people + a.claimed + a.lucky) || a.name.localeCompare(b.name, 'ko'); });
    var kinds = KINDS.map(function (k) { var l = orgs.filter(function (o) { return o.kind === k; }); return { kind: k, orgs: l.length, people: l.reduce(function (s, o) { return s + o.people; }, 0), claimed: l.reduce(function (s, o) { return s + o.claimed; }, 0), lucky: l.reduce(function (s, o) { return s + o.lucky; }, 0) }; });
    // 당첨자 명단 (번호순) — 이름은 가림
    var list = Object.keys(wins).map(Number).sort(function (a, b) { return a - b; }).map(function (t) {
      var c = claimBy[t], l = lucky[t], who = c || l;
      return { ticket: t, prize: wins[t].join(' · '), name: who ? mask(who.name) : '', org: who ? org(who.church).name : '', claimed: !!c, picked: !!picked[t] };
    });
    var maxTicket = d.winners.reduce(function (m, w) { return Math.max(m, w.ticket); }, 0);
    var a = d.apps.reduce(function (s, x) { s.a += x.adults || 0; s.m += x.minors || 0; return s; }, { a: 0, m: 0 });
    return {
      ev: ev, prizes: prizes.sort(function (x, y) { return x.seq - y.seq; }), orgs: orgs, kinds: kinds, list: list,
      k: { apps: d.apps.length, adults: a.a, minors: a.m, appOrgs: orgs.filter(function (o) { return o.apps; }).length,
           tickets: maxTicket, luckyMade: d.lucky ? d.lucky.length : 0, luckyReg: Object.keys(lucky).length,
           winners: list.length, voids: Object.keys(voids).length, claimed: d.claims.length, batches: Object.keys(batches).length,
           picked: list.filter(function (x) { return x.picked; }).length,
           orgs: orgs.filter(function (o) { return o.kind !== '소속 없음'; }).length,
           churches: orgs.filter(function (o) { return o.kind === '회원교회' || o.kind === '그 밖의 교회'; }).length }
    };
  }

  // ---------- 보고서 조각 (화면 · PDF 공용) ----------
  function title(D) { return D.ev.title || ('제' + D.ev.no + '회 3·1 만세길 걷기'); }
  function headHtml(D) {
    return '<div class="rp-head"><p class="rp-eyebrow">삼일만세운동본부 · 3·1 만세길 걷기 결과 보고</p><h2>' + esc(title(D)) + '</h2>' +
      '<p class="rp-meta">' + [D.ev.event_date ? dot(D.ev.event_date) : '', D.ev.place || '', '주최 삼일만세운동본부 · 주관 삼괴지역기독교연합회'].filter(Boolean).map(esc).join(' · ') + '</p></div>';
  }
  function kpiHtml(D) {
    var k = D.k, cells = [];
    if (k.luckyMade) cells.push(['행운권 등록', n0(k.luckyReg) + '<small> / ' + n0(k.luckyMade) + '장</small>']);
    else if (k.tickets) cells.push(['번호표', '1~' + n0(k.tickets) + '<small>번</small>']);
    cells.push(['참여 교회 · 단체', n0(k.orgs) + '<small>곳 (교회 ' + k.churches + ')</small>']);
    if (k.apps) cells.push(['홈페이지 참가 신청', n0(k.adults + k.minors) + '<small>명 · ' + k.apps + '건</small>']);
    cells.push(['경품 당첨', n0(k.winners) + '<small>장' + (k.voids ? ' · 무효 ' + k.voids : '') + '</small>']);
    cells.push(['당첨 인증', n0(k.claimed) + '<small>장 · ' + pct(k.claimed, k.winners) + '%</small>']);
    cells.push(['경품 수령', n0(k.picked) + '<small>장 · ' + pct(k.picked, k.winners) + '%</small>']);
    return '<div class="rp-kpis">' + cells.map(function (c) { return '<div><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; }).join('') + '</div>';
  }
  function kindHtml(D) {
    return '<h3>참여 교회 · 시민 구분</h3><table class="rp-t"><tr><th>구분</th><th class="r">곳</th>' + (D.k.apps ? '<th class="r">신청 인원</th>' : '') +
      (D.k.luckyMade ? '<th class="r">행운권 등록</th>' : '') + '<th class="r">당첨 인증</th></tr>' +
      D.kinds.map(function (x) { return '<tr><td>' + x.kind + '</td><td class="r">' + (x.kind === '소속 없음' ? '–' : n0(x.orgs)) + '</td>' + (D.k.apps ? '<td class="r">' + n0(x.people) + '</td>' : '') +
        (D.k.luckyMade ? '<td class="r">' + n0(x.lucky) + '</td>' : '') + '<td class="r">' + n0(x.claimed) + '</td></tr>'; }).join('') + '</table>' +
      '<p class="rp-note">회원교회: 삼괴지역기독교연합회 소속 교회 · 단체 · 시민: 의용소방대 · 방범대 등 교회 밖 소속 (당첨 인증 · 등록 때 적은 소속 기준)</p>';
  }
  // 가로 막대 — 값이 큰 것부터, 막대 길이는 가장 큰 값 기준
  function bars(rows, opt) {
    var max = rows.reduce(function (m, r) { return Math.max(m, r.v); }, 0) || 1;
    return '<div class="rp-bars">' + rows.map(function (r) {
      return '<div class="rp-bar"><span class="l">' + esc(r.label) + '</span><span class="b"><i style="width:' + Math.max(1, r.v / max * 100).toFixed(1) + '%"></i></span><span class="v">' + n0(r.v) + (opt.unit || '') + '</span></div>';
    }).join('') + '</div>';
  }
  // 소속별 막대그래프 — [{html, rows}] (PDF에서 쪽 나누기에 줄 수를 씀)
  function orgCharts(D, top) {
    var out = [], by = function (f) { return D.orgs.filter(function (o) { return o[f] && o.kind !== '소속 없음'; }).sort(function (a, b) { return b[f] - a[f] || a.name.localeCompare(b.name, 'ko'); }); };
    [['lucky', '소속별 행운권 등록', '명'], ['claimed', '소속별 경품 당첨 인증', '장'], ['people', '교회별 홈페이지 참가 신청 인원', '명']].forEach(function (c) {
      var l = by(c[0]); if (!l.length) return;
      out.push({ rows: Math.min(top, l.length), html: '<h3>' + c[1] + '</h3>' + bars(l.slice(0, top).map(function (o) { return { label: o.name, v: o[c[0]] }; }), { unit: c[2] }) +
        (l.length > top ? '<p class="rp-note">그 밖 ' + (l.length - top) + '곳은 소속별 전체 표에</p>' : '') });
    });
    return out;
  }
  function prizeChartHtml(D) {
    if (!D.prizes.length) return '';
    return '<h3>경품별 당첨 · 인증 · 수령</h3><div class="rp-legend"><i class="s1"></i>수령 <i class="s2"></i>인증만 (아직 안 받음) <i class="s3"></i>인증 안 함</div>' +
      '<div class="rp-bars">' + D.prizes.map(function (p) {
        var a = p.picked, b = Math.max(0, p.claimed - p.picked), c = Math.max(0, p.n - p.claimed), w = function (x) { return (x / p.n * 100).toFixed(1) + '%'; };
        return '<div class="rp-bar"><span class="l">' + esc(p.prize) + '</span><span class="b st"><i class="s1" style="width:' + w(a) + '"></i><i class="s2" style="width:' + w(b) + '"></i><i class="s3" style="width:' + w(c) + '"></i></span>' +
          '<span class="v">' + n0(p.picked) + '/' + n0(p.n) + '</span></div>';
      }).join('') + '</div>';
  }
  function prizeTableHtml(D) {
    if (!D.prizes.length) return '';
    var t = D.prizes.reduce(function (s, p) { s.n += p.n; s.c += p.claimed; s.p += p.picked; return s; }, { n: 0, c: 0, p: 0 });
    return '<table class="rp-t"><tr><th>경품</th><th class="r">당첨</th><th class="r">인증</th><th class="r">수령</th><th class="r">남음</th></tr>' +
      D.prizes.map(function (p) { return '<tr><td>' + esc(p.prize) + '</td><td class="r">' + n0(p.n) + '</td><td class="r">' + n0(p.claimed) + '</td><td class="r">' + n0(p.picked) + '</td><td class="r">' + n0(p.n - p.picked) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td>합계</td><td class="r">' + n0(t.n) + '</td><td class="r">' + n0(t.c) + '</td><td class="r">' + n0(t.p) + '</td><td class="r">' + n0(t.n - t.p) + '</td></tr></table>';
  }
  function orgRows(rows, D) {
    return rows.map(function (o) { return '<tr><td>' + esc(o.name) + '</td><td>' + o.kind + '</td>' + (D.k.apps ? '<td class="r">' + (o.people ? n0(o.people) : '–') + '</td>' : '') +
      (D.k.luckyMade ? '<td class="r">' + (o.lucky ? n0(o.lucky) : '–') + '</td>' : '') + '<td class="r">' + (o.claimed ? n0(o.claimed) : '–') + '</td><td class="r">' + (o.picked ? n0(o.picked) : '–') + '</td></tr>'; }).join('');
  }
  function orgHead(D) { return '<tr><th>소속</th><th>구분</th>' + (D.k.apps ? '<th class="r">신청 인원</th>' : '') + (D.k.luckyMade ? '<th class="r">행운권 등록</th>' : '') + '<th class="r">당첨 인증</th><th class="r">수령</th></tr>'; }
  function winHead() { return '<tr><th class="r">번호</th><th>경품</th><th>이름</th><th>소속</th><th class="c">인증</th><th class="c">수령</th></tr>'; }
  function winRows(rows) {
    return rows.map(function (x) { return '<tr><td class="r"><b>' + x.ticket + '</b></td><td>' + esc(x.prize) + '</td><td>' + (x.name ? esc(x.name) : '<span class="rp-dim">–</span>') + '</td><td>' + esc(x.org) + '</td>' +
      '<td class="c">' + (x.claimed ? '✓' : '') + '</td><td class="c">' + (x.picked ? '✓' : '') + '</td></tr>'; }).join('');
  }

  // 화면용 (한 쪽으로 이어서) — 숫자 · 구분 · 경품 · 소속별 막대는 관리자 메뉴와 홈페이지 공개 화면이 같이 씀
  function isEmpty(D) { return !D.list.length && !D.k.apps && !D.k.luckyReg; }
  function topHtml(D) {
    return headHtml(D) + kpiHtml(D) + '<div class="rp-2">' + '<div>' + kindHtml(D) + (D.prizes.length ? '<h3>경품별 표</h3>' + prizeTableHtml(D) : '') + '</div><div>' + prizeChartHtml(D) + '</div></div>' +
      orgCharts(D, 15).map(function (c) { return c.html; }).join('');
  }
  function screenHtml(D) {
    if (isEmpty(D)) return headHtml(D) + '<div class="o-empty">이 회차에는 아직 신청 · 경품 · 행운권 기록이 없습니다.</div>';
    return '<div class="rp">' + topHtml(D) +
      '<details class="rp-more"><summary>소속별 전체 표 (' + D.orgs.length + '곳)</summary><div class="o-table-wrap"><table class="rp-t">' + orgHead(D) + orgRows(D.orgs, D) + '</table></div></details>' +
      (D.list.length ? '<details class="rp-more"><summary>당첨자 명단 (' + D.list.length + '장 · 이름 가림)</summary><div class="o-table-wrap"><table class="rp-t">' + winHead() + winRows(D.list) + '</table></div></details>' : '') +
      '<p class="rp-note">이름은 가운데 글자를 가렸습니다 (홍*동). 불러온 시각 ' + new Date().toLocaleString('ko-KR') + '</p></div>';
  }

  // 홈페이지 공개 화면 (report.html) — 게시한 요약 (publicData) 그대로
  function publicHtml(D, at) {
    return '<div class="rp">' + topHtml(D) +
      (D.orgs.length ? '<details class="rp-more"><summary>교회별 전체 표 (' + D.orgs.length + '곳)</summary><div class="o-table-wrap"><table class="rp-t">' + orgHead(D) + orgRows(D.orgs, D) + '</table></div></details>' : '') +
      '<p class="rp-note">사람 이름은 싣지 않았고, 단체 · 시민은 곳 수만 보입니다. 기록: 삼일만세운동본부 걷기대회 관리' + (at ? ' · ' + kdate(at) + ' 게시' : '') + '</p></div>';
  }

  // PDF용 — A4 한 쪽씩 (휴대폰에서도 그림 크기 제한에 걸리지 않게 한 쪽씩 그림)
  function pagesHtml(D) {
    var pages = [], foot = function (i, n) { return '<div class="pg-foot">삼일만세운동본부 · ' + esc(title(D)) + ' 결과 보고 · 이름은 가렸습니다 · ' + i + ' / ' + n + '</div>'; };
    pages.push(headHtml(D) + kpiHtml(D) + kindHtml(D) + prizeChartHtml(D));
    // 소속별 막대: 한 쪽에 막대 34줄 안쪽으로 묶음
    var cur = '', used = 0;
    orgCharts(D, 26).forEach(function (c) { var need = c.rows + 3; if (cur && used + need > 34) { pages.push(cur); cur = ''; used = 0; } cur += c.html; used += need; });
    if (cur) pages.push(cur);
    pages.push('<h3>경품별 표</h3>' + prizeTableHtml(D));
    for (var i = 0; i < D.orgs.length; i += 30) pages.push('<h3>소속별 전체 표' + (i ? ' (이어서)' : '') + '</h3><table class="rp-t">' + orgHead(D) + orgRows(D.orgs.slice(i, i + 30), D) + '</table>');
    for (var j = 0; j < D.list.length; j += 30) pages.push('<h3>당첨자 명단' + (j ? ' (이어서)' : ' — 번호순 · 이름 가림') + '</h3><table class="rp-t">' + winHead() + winRows(D.list.slice(j, j + 30)) + '</table>');
    return pages.map(function (h, k) { return '<div class="rp pg">' + h + foot(k + 1, pages.length) + '</div>'; });
  }
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('도구를 불러오지 못했습니다 (' + src.split('/').pop() + ')')); }; document.head.appendChild(s); }); }
  async function makePdf(D, onStep) {
    if (!window.html2canvas) await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    if (!window.jspdf) await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    var box = document.createElement('div'); box.className = 'rp-print'; document.body.appendChild(box);
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true }), pages = pagesHtml(D);
    try {
      for (var i = 0; i < pages.length; i++) {
        onStep(i + 1, pages.length);
        box.innerHTML = pages[i];
        var c = await window.html2canvas(box.firstChild, { scale: 1.6, backgroundColor: '#ffffff', logging: false, useCORS: true });
        if (i) doc.addPage();
        doc.addImage(c.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
    } finally { box.remove(); }
    return doc.output('blob');
  }

  // ---------- PDF로 자료실(공문 · 자료 → 행사 운영)에 올리기 ----------
  async function uploadPdf() {
    if (busy || !DATA) return;
    var D = DATA, t = title(D) + ' 결과 보고 (참여 · 경품 당첨, 이름 가림)';
    if (!confirm('"' + t + '"를 PDF로 만들어 공문 · 자료(행사 운영)에 올립니다.\n이름은 모두 가려서 들어가고, 만세운동본부 임원 누구나 볼 수 있습니다.\n\n계속할까요?')) return;
    busy = true; $('rpPdf').disabled = true; var msg = $('rpMsg'); msg.className = 'm-msg';
    try {
      var blob = await makePdf(D, function (i, n) { msg.textContent = 'PDF를 만드는 중… (' + i + ' / ' + n + '쪽)'; });
      msg.textContent = '자료실에 올리는 중…';
      var year = parseInt(String(D.ev.event_date || D.ev.event).slice(0, 4), 10) || new Date().getFullYear();
      var file = new File([blob], '제' + D.ev.no + '회_3·1만세길걷기_결과보고_' + today().replace(/-/g, '') + '.pdf', { type: 'application/pdf' });
      var path = await ctx.putFile(file, year, '행사 운영', false);
      await ctx.insertDoc({ year: year, category: '행사 운영', title: t, doc_date: today(), date_text: today(), doc_no: null,
        note: '걷기대회 기록으로 만든 요약 — 이름은 가렸습니다', path: path, mime: 'application/pdf', size: file.size,
        orig_path: null, orig_name: null, sensitive: false, uploaded_by: ctx.me.id, uploader_name: (ctx.profile && ctx.profile.name) || ctx.me.email });
      if (ctx.reloadDocs) ctx.reloadDocs();
      msg.className = 'm-msg ok'; msg.textContent = '올렸습니다 — 공문 · 자료 탭의 \'행사 운영\'에서 볼 수 있습니다. (' + (file.size / 1048576).toFixed(1) + 'MB)';
    } catch (ex) { msg.className = 'm-msg err'; msg.textContent = '올리지 못했습니다: ' + (window.mErr ? window.mErr(ex) : (ex && ex.message)); }
    busy = false; $('rpPdf').disabled = !DATA;
  }

  // ---------- 홈페이지에 게시 (만세 walk_reports → 첫 화면 '결과 보고' 띠 · report.html) ----------
  var PUB_KINDS = { '회원교회': 1, '그 밖의 교회': 1 }, PUB = null;
  function publicData(D) {   // 사람 이름 없는 요약 — 당첨자 명단 빼고, 소속은 교회만 (단체 · 시민은 구분 표의 곳 수로만)
    return { v: 1, ev: { event: D.ev.event, no: D.ev.no, title: title(D), event_date: D.ev.event_date || null, place: D.ev.place || null },
      k: D.k, kinds: D.kinds, prizes: D.prizes, list: [],
      orgs: D.orgs.filter(function (o) { return PUB_KINDS[o.kind]; }) };
  }
  async function loadPub() {
    var st = $('rpPubSt'), b = $('rpPub'); PUB = null; b.disabled = true; st.hidden = true;
    if (!window.msb || !DATA) return;
    var r = await window.msb.from('walk_reports').select('walk_no,published,published_at').eq('walk_no', DATA.ev.no).maybeSingle();
    st.hidden = false;
    if (r.error) {
      st.innerHTML = '<span class="chip bad">게시 준비 안 됨</span> 만세운동본부 Supabase에 결과 보고 표가 아직 없습니다. 최고관리자가 <a href="../setup-sql.html" target="_blank" rel="noopener">설치 SQL</a>(삼일만세운동본부)을 한 번 더 실행하면 게시할 수 있습니다.';
      return;
    }
    PUB = r.data; b.disabled = isEmpty(DATA); drawPub();
  }
  function drawPub() {
    var st = $('rpPubSt'), on = !!(PUB && PUB.published);
    $('rpPub').textContent = on ? '최신 기록으로 다시 게시' : '홈페이지에 게시';
    st.innerHTML = on
      ? '<span class="chip ok">홈페이지에 게시됨</span> ' + kdate(PUB.published_at) + ' 게시 · <a href="report.html?w=' + PUB.walk_no + '" target="_blank" rel="noopener">공개 화면 보기</a> · <button class="lk" type="button" id="rpUnpub">게시 내리기</button>'
      : '<span class="chip gray">게시 안 함</span> ' + (isEmpty(DATA) ? '기록이 생기면 게시할 수 있습니다.' : '게시하면 홈페이지 첫 화면에 이 회차 결과 보고가 나옵니다 — 교회 이름과 숫자만, 사람 이름 없이.');
  }
  async function publish() {
    if (busy || !DATA || isEmpty(DATA)) return;
    var D = DATA, t = title(D), again = !!(PUB && PUB.published);
    if (!confirm('"' + t + '" 결과 보고를 홈페이지에 ' + (again ? '지금 기록으로 다시 ' : '') + '게시합니다.\n\n' +
      '· 누구나 봅니다 — 첫 화면의 \'결과 보고\' 띠\n· 숫자와 교회 이름만 올라갑니다. 당첨자 명단은 빼고, 단체 · 시민은 이름 없이 곳 수만\n· 나중에 기록이 바뀌면 \'다시 게시\'로 고칩니다\n\n계속할까요?')) return;
    busy = true; $('rpPub').disabled = true; var msg = $('rpMsg'); msg.className = 'm-msg'; msg.textContent = '게시하는 중…';
    try {
      var r = await window.msb.from('walk_reports').upsert({ walk_no: D.ev.no, event_key: D.ev.event, title: t, event_date: D.ev.event_date || null, place: D.ev.place || null,
        data: publicData(D), published: true }, { onConflict: 'walk_no' }).select('walk_no,published,published_at').single();
      if (r.error) throw r.error;
      PUB = r.data; drawPub();
      msg.className = 'm-msg ok'; msg.textContent = '게시했습니다 — 홈페이지 첫 화면에 결과 보고가 나옵니다.';
    } catch (ex) { msg.className = 'm-msg err'; msg.textContent = '게시하지 못했습니다: ' + (window.mErr ? window.mErr(ex) : (ex && ex.message)); }
    busy = false; $('rpPub').disabled = !DATA || isEmpty(DATA);
  }
  async function unpublish() {
    if (busy || !PUB) return;
    if (!confirm('제' + PUB.walk_no + '회 결과 보고를 홈페이지에서 내립니다. (임원은 계속 볼 수 있고, 다시 게시할 수 있습니다)')) return;
    busy = true; var msg = $('rpMsg'); msg.className = 'm-msg';
    try {
      var r = await window.msb.from('walk_reports').update({ published: false }).eq('walk_no', PUB.walk_no).select('walk_no,published,published_at').single();
      if (r.error) throw r.error;
      PUB = r.data; drawPub(); msg.className = 'm-msg ok'; msg.textContent = '홈페이지에서 내렸습니다.';
    } catch (ex) { msg.className = 'm-msg err'; msg.textContent = '내리지 못했습니다: ' + (window.mErr ? window.mErr(ex) : (ex && ex.message)); }
    busy = false;
  }

  // ---------- 시작 (officer.js 가 임원 확인 뒤 부름) ----------
  window.WalkReport = {
    init: async function (c) {
      ctx = c;
      $('rpSel').addEventListener('change', loadReport);
      $('rpPdf').addEventListener('click', uploadPdf);
      $('rpPub').addEventListener('click', publish);
      $('rpPubSt').addEventListener('click', function (e) { if (e.target.id === 'rpUnpub') unpublish(); });
      // 인쇄: 결과 보고만, 접어 둔 표도 펼쳐서
      $('rpPrint').addEventListener('click', function () {
        var closed = Array.prototype.filter.call(document.querySelectorAll('#rpBody details'), function (d) { return !d.open; });
        closed.forEach(function (d) { d.open = true; });
        document.body.classList.add('rp-printing'); window.print();
        setTimeout(function () { document.body.classList.remove('rp-printing'); closed.forEach(function (d) { d.open = false; }); }, 500);
      });
      sg = window.msb;
      var el = $('wkLink'); if (el) { el.innerHTML = ''; el.hidden = true; }
      if (!sg) { $('rpSel').disabled = true; $('rpPdf').disabled = true; $('rpPub').disabled = true; $('rpBody').innerHTML = '<div class="o-empty">기록을 불러오지 못했습니다. 새로 고쳐 주세요.</div>'; return; }
      await loadEvents(); await loadReport();
    },
    publicHtml: publicHtml,
    _summarize: summarize, _mask: mask, _publicData: publicData
  };
})();
