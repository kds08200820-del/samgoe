// 삼일만세운동본부 공개 페이지 — 걷기대회·활동 기록·연혁·언론·자료실, 행사 상세(사진·영상·문서)와 사진 보기.
// 기본 자료는 data.js(고정), 홈페이지에서 임원이 추가한 기록·사진은 admin.js 가 불러와 window.MZ 로 합칩니다.
(function () {
  var D = window.MANSE_DATA; if (!D) return;
  // 이 스크립트가 있는 archive/ 폴더 기준 (페이지 위치와 무관하게 동작)
  var ROOT = new URL('.', (document.currentScript && document.currentScript.src) || location.href).href;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(d) { var p = String(d).split('-'); return p[0] + '.' + (p[1] || '') + (p[2] ? '.' + p[2] : ''); }

  // 사진을 {full, thumb, w, h, c} 로 통일 (admin.js가 추가하는 사진은 db:true, id, canDel 포함)
  var EV = D.events.map(function (e) {
    var o = Object.assign({}, e);
    o.photos = (e.photos || []).map(function (p) {
      return { full: ROOT + 'photos/' + e.id + '/' + p[0], thumb: ROOT + 'photos/' + e.id + '/t/' + p[0], w: p[1], h: p[2], c: p[3] || '' };
    });
    return o;
  });
  var byId = {};
  function reindex() { byId = {}; EV.forEach(function (e) { byId[e.id] = e; }); }
  function sortEV() { EV.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }); }
  sortEV(); reindex();
  function cover(e) { var p = e.photos[e.cover || 0] || e.photos[0]; return p ? p.thumb : ''; }

  // ---------- 3·1만세길 걷기대회 ----------
  function renderWalks() {
    var walks = EV.filter(function (e) { return e.walk; }).sort(function (a, b) { return a.walk - b.walk; });
    $('walkGrid').innerHTML = walks.map(function (e) {
      var c = cover(e);
      return '<button type="button" class="mz-walk" data-ev="' + esc(e.id) + '">' +
        (c ? '<span class="ph" style="background-image:url(\'' + c + '\')"></span>' : '<span class="ph none">제' + e.walk + '회</span>') +
        '<span class="bd"><span class="no">제' + e.walk + '회</span><span class="dt" style="display:block">' + fmtDate(e.date) + '</span>' +
        (e.people ? '<span class="pp">' + esc(e.people) + '</span>' : '') + '</span></button>';
    }).join('');
  }

  // ---------- 활동 기록 ----------
  var st = { y: '', c: '', all: false };
  function pick(box, attr, val) { box.querySelectorAll('.mz-chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute(attr) === val ? 'true' : 'false'); }); }
  function renderFilters() {
    var years = Array.from(new Set(EV.map(function (e) { return e.year; })));
    var cats = Array.from(new Set(EV.map(function (e) { return e.cat; })));
    $('actYears').innerHTML = '<button class="mz-chip" data-y="" aria-pressed="' + (!st.y) + '">전체</button>' +
      years.map(function (y) { return '<button class="mz-chip" data-y="' + y + '" aria-pressed="' + (String(y) === st.y) + '">' + y + '</button>'; }).join('');
    $('actCats').innerHTML = '<button class="mz-chip sm" data-c="" aria-pressed="' + (!st.c) + '">모든 활동</button>' +
      cats.map(function (c) { return '<button class="mz-chip sm" data-c="' + esc(c) + '" aria-pressed="' + (c === st.c) + '">' + esc(c) + '</button>'; }).join('');
  }
  $('actYears').addEventListener('click', function (e) { var b = e.target.closest('.mz-chip'); if (!b) return; st.y = b.dataset.y; pick(this, 'data-y', st.y); renderAct(); });
  $('actCats').addEventListener('click', function (e) { var b = e.target.closest('.mz-chip'); if (!b) return; st.c = b.dataset.c; pick(this, 'data-c', st.c); renderAct(); });
  function renderAct() {
    var list = EV.filter(function (e) { return (!st.y || String(e.year) === st.y) && (!st.c || e.cat === st.c); });
    var LIMIT = 9, show = (st.all || st.y || st.c) ? list : list.slice(0, LIMIT);
    $('actGrid').innerHTML = show.map(function (e) {
      var c = cover(e);
      return '<button type="button" class="mz-ev" data-ev="' + esc(e.id) + '">' +
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

  // ---------- 연혁 · 언론 · 자료실 ----------
  $('timeline').innerHTML = '<ul>' + D.timeline.map(function (t) {
    var key = /회칙|등록|표창|제\d회|조직|개통/.test(t[1]);
    return '<li class="' + (key ? 'key' : '') + '"><div class="d">' + esc(t[0]) + '</div><div class="t">' + esc(t[1]) + '</div></li>';
  }).join('') + '</ul>';
  $('pressList').innerHTML = D.press.slice().sort(function (a, b) { return b.year - a.year; }).map(function (g) {
    return '<div class="mz-list"><h3>' + g.year + '년 만세길 걷기 보도</h3>' + g.items.map(function (it) {
      return '<div class="mz-item"><div><div class="t">' + esc(it[1]) + '</div><div class="s">' + esc(it[0]) + '</div></div>' +
        (it[2] ? '<a class="go" href="' + esc(it[2]) + '" target="_blank" rel="noopener">기사 보기</a>' : '') + '</div>';
    }).join('') + '</div>';
  }).join('');
  $('docList').innerHTML = ['단체', '행사·언론'].map(function (g) {
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
  function renderThumbs(e) {
    $('dlgThumbs').innerHTML = e.photos.map(function (p, i) {
      return '<div class="mz-th"><button type="button" data-i="' + i + '" aria-label="사진 ' + (i + 1) + ' 크게 보기"><img loading="lazy" src="' + p.thumb + '" alt="' + esc(p.c || e.title + ' 사진 ' + (i + 1)) + '"></button>' +
        (p.canDel ? '<button type="button" class="mz-del" data-del="' + esc(p.id) + '" aria-label="사진 삭제" title="사진 삭제">×</button>' : '') + '</div>';
    }).join('');
    $('dlgCount').textContent = e.photos.length ? '사진 ' + e.photos.length + '장' : '아직 사진이 없습니다.';
  }
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
    renderThumbs(e);
    dlg.classList.add('on'); document.body.classList.add('mz-lock'); dlg.scrollTop = 0;
    $('dlgClose').focus();
    if (push !== false) try { history.replaceState(null, '', '#ev=' + id); } catch (_) {}
    document.dispatchEvent(new CustomEvent('mz:open', { detail: { id: id } }));
  }
  function closeEvent() {
    dlg.classList.remove('on'); document.body.classList.remove('mz-lock');
    dlg.querySelectorAll('video').forEach(function (v) { try { v.pause(); } catch (_) {} });
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $('dlgClose').addEventListener('click', closeEvent);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeEvent(); });
  $('dlgThumbs').addEventListener('click', function (e) {
    var d = e.target.closest('button[data-del]');
    if (d) { document.dispatchEvent(new CustomEvent('mz:delphoto', { detail: { event: cur.id, id: d.dataset.del } })); return; }
    var b = e.target.closest('button[data-i]'); if (b) openViewer(+b.dataset.i);
  });

  // ---------- 사진 보기 ----------
  function show() {
    var p = cur.photos[idx];
    var img = $('vImg'); img.src = p.full; img.alt = p.c || cur.title;
    $('vCap').textContent = (p.c ? p.c + ' · ' : '') + (idx + 1) + ' / ' + cur.photos.length;
    $('vDl').href = p.full;
    var n = cur.photos[idx + 1]; if (n) { var pre = new Image(); pre.src = n.full; }
  }
  function openViewer(i) { if (!cur.photos.length) return; idx = i; show(); viewer.classList.add('on'); $('vClose').focus(); }
  function closeViewer() { viewer.classList.remove('on'); }
  function step(d) { if (!cur || !cur.photos.length) return; idx = (idx + d + cur.photos.length) % cur.photos.length; show(); }
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

  function renderAll() { renderWalks(); renderFilters(); renderAct(); }
  renderAll();

  // ---------- admin.js 가 쓰는 연결부 ----------
  window.MZ = {
    get: function (id) { return byId[id]; },
    current: function () { return cur; },
    // 홈페이지에서 추가된 기록·사진을 합친 뒤 다시 그림
    merge: function (newEvents, photosByEvent) {
      (newEvents || []).forEach(function (e) {
        if (!byId[e.id]) { e.photos = []; EV.push(e); }
        else { var keep = byId[e.id].photos; Object.assign(byId[e.id], e); byId[e.id].photos = keep; }
      });
      sortEV(); reindex();
      EV.forEach(function (e) { e.photos = e.photos.filter(function (p) { return !p.db; }).concat((photosByEvent || {})[e.id] || []); });
      renderAll();
      if (cur && dlg.classList.contains('on')) { cur = byId[cur.id] || cur; renderThumbs(cur); }
    },
    remove: function (id) { EV = EV.filter(function (e) { return e.id !== id; }); reindex(); renderAll(); },
    open: openEvent,
    close: closeEvent
  };

  // 주소의 #ev=행사ID 로 바로 열기 (새로 추가된 기록은 admin.js가 불러온 뒤 다시 시도)
  var m = /#ev=([\w-]+)/.exec(location.hash);
  if (m && byId[m[1]]) openEvent(m[1], false);
  else if (m) document.addEventListener('mz:loaded', function once() { document.removeEventListener('mz:loaded', once); if (byId[m[1]]) openEvent(m[1], false); });
})();
