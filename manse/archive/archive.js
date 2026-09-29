// 삼일만세운동본부 공개 페이지 — 데이터(window.MANSE_DATA)로 걷기대회·활동 기록·연혁·언론·자료실을 그리고,
// 행사 상세(사진·영상·문서)와 사진 보기(키보드·스와이프)를 제공합니다.
(function () {
  var D = window.MANSE_DATA; if (!D) return;
  // 이 스크립트가 있는 archive/ 폴더 기준 (페이지 위치와 무관하게 동작)
  var ROOT = new URL('.', (document.currentScript && document.currentScript.src) || location.href).href;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function photo(ev, f, thumb) { return ROOT + 'photos/' + ev + '/' + (thumb ? 't/' : '') + f; }
  function fmtDate(d) { var p = d.split('-'); return p[0] + '.' + (p[1] || '') + (p[2] ? '.' + p[2] : ''); }
  function cover(e) { var p = e.photos[e.cover || 0] || e.photos[0]; return p ? photo(e.id, p[0], true) : ''; }
  var EV = D.events.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var byId = {}; EV.forEach(function (e) { byId[e.id] = e; });

  // ---------- 3·1만세길 걷기대회 ----------
  var walks = D.events.filter(function (e) { return e.walk; }).sort(function (a, b) { return a.walk - b.walk; });
  $('walkGrid').innerHTML = walks.map(function (e) {
    var c = cover(e);
    return '<button type="button" class="mz-walk" data-ev="' + e.id + '">' +
      (c ? '<span class="ph" style="background-image:url(\'' + c + '\')"></span>' : '<span class="ph none">제' + e.walk + '회</span>') +
      '<span class="bd"><span class="no">제' + e.walk + '회</span><span class="dt" style="display:block">' + fmtDate(e.date) + '</span>' +
      (e.people ? '<span class="pp">' + esc(e.people) + '</span>' : '') + '</span></button>';
  }).join('');

  // ---------- 활동 기록 ----------
  var years = Array.from(new Set(EV.map(function (e) { return e.year; })));
  var cats = Array.from(new Set(EV.map(function (e) { return e.cat; })));
  var st = { y: '', c: '', all: false };
  $('actYears').innerHTML = '<button class="mz-chip" data-y="" aria-pressed="true">전체</button>' +
    years.map(function (y) { return '<button class="mz-chip" data-y="' + y + '" aria-pressed="false">' + y + '</button>'; }).join('');
  $('actCats').innerHTML = '<button class="mz-chip sm" data-c="" aria-pressed="true">모든 활동</button>' +
    cats.map(function (c) { return '<button class="mz-chip sm" data-c="' + esc(c) + '" aria-pressed="false">' + esc(c) + '</button>'; }).join('');
  function pick(box, attr, val) { box.querySelectorAll('.mz-chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute(attr) === val ? 'true' : 'false'); }); }
  $('actYears').addEventListener('click', function (e) { var b = e.target.closest('.mz-chip'); if (!b) return; st.y = b.dataset.y; pick(this, 'data-y', st.y); renderAct(); });
  $('actCats').addEventListener('click', function (e) { var b = e.target.closest('.mz-chip'); if (!b) return; st.c = b.dataset.c; pick(this, 'data-c', st.c); renderAct(); });
  function renderAct() {
    var list = EV.filter(function (e) { return (!st.y || String(e.year) === st.y) && (!st.c || e.cat === st.c); });
    var LIMIT = 9, show = (st.all || st.y || st.c) ? list : list.slice(0, LIMIT);
    $('actGrid').innerHTML = show.map(function (e) {
      var c = cover(e);
      return '<button type="button" class="mz-ev" data-ev="' + e.id + '">' +
        (c ? '<span class="ph" style="background-image:url(\'' + c + '\')">' + (e.photos.length ? '<span class="cnt">사진 ' + e.photos.length + '</span>' : '') + '</span>'
           : '<span class="ph none"><img src="' + ROOT + '../img/logo-192.png" alt="" /></span>') +
        '<span class="bd"><span class="meta"><span>' + fmtDate(e.date) + '</span><span class="cat">' + esc(e.cat) + '</span></span>' +
        '<h3>' + esc(e.title) + '</h3>' + (e.place ? '<span class="pl">' + esc(e.place) + '</span>' : '') + '</span></button>';
    }).join('') || '<p style="text-align:center;color:var(--muted);grid-column:1/-1">해당하는 활동이 없습니다.</p>';
    var more = $('actMore');
    more.hidden = show.length >= list.length;
    more.querySelector('button').textContent = '활동 ' + (list.length - show.length) + '건 더 보기';
  }
  $('actMore').addEventListener('click', function () { st.all = true; renderAct(); });
  renderAct();

  // ---------- 연혁 ----------
  $('timeline').innerHTML = '<ul>' + D.timeline.map(function (t) {
    var key = /회칙|등록|표창|제\d회|조직|개통/.test(t[1]);
    return '<li class="' + (key ? 'key' : '') + '"><div class="d">' + esc(t[0]) + '</div><div class="t">' + esc(t[1]) + '</div></li>';
  }).join('') + '</ul>';

  // ---------- 언론 보도 ----------
  $('pressList').innerHTML = D.press.slice().sort(function (a, b) { return b.year - a.year; }).map(function (g) {
    return '<div class="mz-list"><h3>' + g.year + '년 만세길 걷기 보도</h3>' + g.items.map(function (it) {
      return '<div class="mz-item"><div><div class="t">' + esc(it[1]) + '</div><div class="s">' + esc(it[0]) + '</div></div>' +
        (it[2] ? '<a class="go" href="' + esc(it[2]) + '" target="_blank" rel="noopener">기사 보기</a>' : '') + '</div>';
    }).join('') + '</div>';
  }).join('');

  // ---------- 자료실 ----------
  var groups = ['단체', '행사·언론'];
  $('docList').innerHTML = groups.map(function (g) {
    var items = D.docs.filter(function (d) { return d.g === g; });
    if (!items.length) return '';
    return '<div class="mz-list"><h3>' + esc(g === '단체' ? '단체 등록·사업계획' : '행사·언론 자료') + '</h3>' + items.map(function (d) {
      return '<div class="mz-item"><div><div class="t">' + esc(d.t) + '</div><div class="s">' + esc(d.d) + ' · PDF ' + d.p + '쪽 · ' +
        (d.s > 1048576 ? (d.s / 1048576).toFixed(1) + 'MB' : Math.round(d.s / 1024) + 'KB') + '</div></div>' +
        '<a class="go" href="' + ROOT + 'docs/' + encodeURIComponent(d.f) + '" target="_blank" rel="noopener">열기</a></div>';
    }).join('') + '</div>';
  }).join('');

  // ---------- 행사 상세 ----------
  var dlg = $('evDlg'), viewer = $('viewer'), cur = null, idx = 0, lastFocus = null;
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ev]'); if (!b) return;
    e.preventDefault(); openEvent(b.dataset.ev);
  });
  function docTitle(f) { var d = D.docs.find(function (x) { return x.f === f; }); return d ? d.t : f; }
  function openEvent(id, push) {
    var e = byId[id]; if (!e) return;
    cur = e; lastFocus = document.activeElement;
    $('dlgMeta').textContent = fmtDate(e.date) + ' · ' + e.cat + (e.people ? ' · ' + e.people : '');
    $('dlgTitle').textContent = e.title;
    $('dlgPlace').textContent = e.place || ''; $('dlgPlace').hidden = !e.place;
    $('dlgSum').textContent = e.summary || '';
    $('dlgFacts').innerHTML = (e.facts || []).map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('');
    var links = (e.docs || []).map(function (f) { return '<a class="mz-btn ghost" style="height:38px;font-size:14px" href="' + ROOT + 'docs/' + encodeURIComponent(f) + '" target="_blank" rel="noopener">📄 ' + esc(docTitle(f)) + '</a>'; })
      .concat((e.links || []).map(function (l) { return '<a class="mz-btn ghost" style="height:38px;font-size:14px" href="' + esc(l[1]) + '" target="_blank" rel="noopener">▶ ' + esc(l[0]) + '</a>'; }));
    $('dlgLinks').innerHTML = links.join('');
    $('dlgVids').innerHTML = (e.videos || []).map(function (v) {
      return '<div><video controls preload="none" playsinline poster="' + ROOT + 'video/' + v[0] + '.jpg"><source src="' + ROOT + 'video/' + v[0] + '.mp4" type="video/mp4"></video><div class="cap">' + esc(v[1]) + '</div></div>';
    }).join('');
    $('dlgThumbs').innerHTML = e.photos.map(function (p, i) {
      return '<button type="button" data-i="' + i + '" aria-label="사진 ' + (i + 1) + ' 크게 보기"><img loading="lazy" src="' + photo(e.id, p[0], true) + '" alt="' + esc(p[3] || e.title + ' 사진 ' + (i + 1)) + '"></button>';
    }).join('');
    $('dlgCount').textContent = e.photos.length ? '사진 ' + e.photos.length + '장' : '';
    dlg.classList.add('on'); document.body.classList.add('mz-lock'); dlg.scrollTop = 0;
    $('dlgClose').focus();
    if (push !== false) try { history.replaceState(null, '', '#ev=' + id); } catch (_) {}
  }
  function closeEvent() {
    dlg.classList.remove('on'); document.body.classList.remove('mz-lock');
    dlg.querySelectorAll('video').forEach(function (v) { try { v.pause(); } catch (_) {} });
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $('dlgClose').addEventListener('click', closeEvent);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeEvent(); });
  $('dlgThumbs').addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (b) openViewer(+b.dataset.i); });

  // ---------- 사진 보기 ----------
  function show() {
    var p = cur.photos[idx];
    var img = $('vImg'); img.src = photo(cur.id, p[0]); img.alt = p[3] || cur.title;
    $('vCap').textContent = (p[3] ? p[3] + ' · ' : '') + (idx + 1) + ' / ' + cur.photos.length;
    $('vDl').href = photo(cur.id, p[0]);
    var n = cur.photos[idx + 1]; if (n) { var pre = new Image(); pre.src = photo(cur.id, n[0]); }
  }
  function openViewer(i) { idx = i; show(); viewer.classList.add('on'); $('vClose').focus(); }
  function closeViewer() { viewer.classList.remove('on'); }
  function step(d) { if (!cur) return; idx = (idx + d + cur.photos.length) % cur.photos.length; show(); }
  $('vPrev').addEventListener('click', function () { step(-1); });
  $('vNext').addEventListener('click', function () { step(1); });
  $('vClose').addEventListener('click', closeViewer);
  viewer.addEventListener('click', function (e) { if (e.target === viewer) closeViewer(); });
  var sx = null;
  viewer.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  viewer.addEventListener('touchend', function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1); sx = null; });
  document.addEventListener('keydown', function (e) {
    if (viewer.classList.contains('on')) {
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'Escape') closeViewer();
    } else if (dlg.classList.contains('on') && e.key === 'Escape') closeEvent();
  });

  // 주소의 #ev=행사ID 로 바로 열기
  var m = /#ev=([\w-]+)/.exec(location.hash);
  if (m && byId[m[1]]) openEvent(m[1], false);
})();
