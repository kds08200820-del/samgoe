// ============================================================
//  삼기연 첫 화면 — 영상처럼 움직이는 히어로 (assets/hero-motion.css)
//  4장면을 17초 동안 차례로 보여 주고 되풀이합니다. 숫자는 세어 올라가고, 그래프는 막대가 자라며 누적선이 그려집니다.
//  · 숫자 · 그래프는 홈페이지 갤러리 기록(공개)에서 바로 셉니다 — 못 읽으면 아래 기본값(2026년 10월 기준)
//  · 화면 밖이거나 다른 탭을 보면 멈추고, '움직임 줄이기' 설정이면 자동 재생하지 않습니다
// ============================================================
(function () {
  var root = document.getElementById('mv'); if (!root) return;
  var scenes = Array.prototype.slice.call(root.querySelectorAll('.mv-scene'));
  var chaps = Array.prototype.slice.call(root.querySelectorAll('.mv-chap button'));
  var DUR = [3600, 4400, 4800, 4600], TOTAL = DUR.reduce(function (a, b) { return a + b; }, 0);
  var START = DUR.map(function (_, i) { return DUR.slice(0, i).reduce(function (a, b) { return a + b; }, 0); });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t = 0, cur = -1, userPaused = !!reduce, autoPaused = false, last = 0;

  // ---------- 자료 (기본값 → 갤러리에서 다시 셈) ----------
  var THIS_YEAR = new Date().getFullYear();
  var DATA = { posts: 46, photos: 502, years: { 2021: 4, 2022: 2, 2023: 2, 2024: 4, 2025: 9, 2026: 20 } };

  function n0(v) { return Number(v || 0).toLocaleString('ko-KR'); }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }

  // ---------- ② 숫자 세어 올리기 ----------
  function countUp() {
    root.querySelectorAll('.mv-kpi b[data-to]').forEach(function (b, i) {
      var to = +b.getAttribute('data-to'), num = b.firstChild;
      if (reduce) { num.nodeValue = n0(to); return; }
      var t0 = performance.now() + 250 + i * 160, d = 1500;
      (function step(now) {
        var k = Math.max(0, Math.min(1, (now - t0) / d));
        num.nodeValue = n0(Math.round(to * ease(k)));
        if (k < 1 && cur === 1) requestAnimationFrame(step); else num.nodeValue = n0(to);
      })(performance.now());
    });
  }

  // ---------- ③ 그래프 (막대: 그해 기록 · 선: 누적) ----------
  function drawChart() {
    var svg = root.querySelector('.mv-chart'); if (!svg) return;
    var ys = []; for (var y = THIS_YEAR - 5; y <= THIS_YEAR; y++) ys.push(y);
    var vals = ys.map(function (y) { return DATA.years[y] || 0; }), cum = [], s = 0;
    vals.forEach(function (v) { s += v; cum.push(s); });
    var W = 760, H = 300, L = 40, R = 720, B = 250, top = 40, slot = (R - L) / ys.length, bw = Math.min(64, slot * 0.46);
    var vmax = Math.max.apply(null, vals.concat([1])), cmax = Math.max.apply(null, cum.concat([1]));
    var yv = function (v) { return B - (B - top - 34) * v / vmax; }, yc = function (v) { return B - (B - top) * v / cmax; };
    var h = '<defs><linearGradient id="mvBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6a52"/><stop offset="1" stop-color="#5a4232"/></linearGradient>' +
      '<linearGradient id="mvBarHot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d07a55"/><stop offset="1" stop-color="#9c4320"/></linearGradient></defs>' +
      '<line class="ax" x1="' + L + '" y1="' + B + '" x2="' + R + '" y2="' + B + '"/>';
    var pts = [];
    ys.forEach(function (y, i) {
      var cx = L + slot * (i + 0.5), top_ = yv(vals[i]), last = i === ys.length - 1;
      h += '<rect class="bar' + (last ? ' last' : '') + '" x="' + (cx - bw / 2) + '" y="' + top_ + '" width="' + bw + '" height="' + Math.max(0, B - top_) + '" rx="3" style="transition-delay:' + (0.15 + i * 0.12) + 's"/>' +
        '<text class="val" x="' + cx + '" y="' + (top_ - 9) + '" style="transition-delay:' + (0.6 + i * 0.12) + 's">' + vals[i] + '</text>' +
        '<text class="yr" x="' + cx + '" y="' + (B + 24) + '">' + y + '</text>';
      pts.push([cx, yc(cum[i])]);
    });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    h += '<path class="cum" d="' + d + '"/>';
    pts.forEach(function (p, i) {
      var delay = (1.1 + 1.6 * i / Math.max(1, pts.length - 1)).toFixed(2);
      h += '<circle class="dot" cx="' + p[0] + '" cy="' + p[1] + '" r="5" style="transition-delay:' + delay + 's"/>';
      if (i === pts.length - 1) h += '<text class="cumv" x="' + p[0] + '" y="' + (p[1] - 14) + '" style="transition-delay:' + delay + 's">누적 ' + cum[i] + '</text>';
    });
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.innerHTML = h;
    var path = svg.querySelector('.cum'), len = path.getTotalLength ? path.getTotalLength() : 1000;
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len; path.dataset.len = len;
    var cap = root.querySelector('[data-mv="range"]'); if (cap) cap.textContent = ys[0] + '~' + ys[ys.length - 1];
  }
  function lineIn(on) {
    var p = root.querySelector('.mv-chart .cum'); if (!p) return;
    p.style.strokeDashoffset = on ? 0 : p.dataset.len;
  }

  // ---------- 장면 전환 ----------
  function show(i) {
    if (i === cur) return;
    cur = i;
    scenes.forEach(function (s, k) { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    chaps.forEach(function (c, k) { c.classList.toggle('on', k === i); });
    lineIn(false);
    if (i === 1) countUp();
    if (i === 2) { void root.offsetWidth; requestAnimationFrame(function () { lineIn(true); }); }
  }
  function sceneAt(ms) { for (var i = DUR.length - 1; i >= 0; i--) if (ms >= START[i]) return i; return 0; }
  function paint() {
    chaps.forEach(function (c, k) {
      var f = k < cur ? 1 : k > cur ? 0 : Math.min(1, (t - START[k]) / DUR[k]);
      c.querySelector('i').style.width = (f * 100).toFixed(1) + '%';
    });
  }
  function tick(now) {
    var dt = last ? Math.min(100, now - last) : 0; last = now;
    var visible = root.offsetParent !== null;   // 행사 안내가 히어로를 차지하면 멈춤
    if (!userPaused && !autoPaused && visible) {
      t += dt; if (t >= TOTAL) t = 0;
      show(sceneAt(t)); paint();
    }
    requestAnimationFrame(tick);
  }
  function setPaused(p) {
    userPaused = p; root.classList.toggle('paused', p);
    root.querySelector('.mv-play').setAttribute('aria-label', p ? '재생' : '멈춤');
  }
  root.querySelector('.mv-play').addEventListener('click', function () { setPaused(!userPaused); });
  chaps.forEach(function (c, k) {
    c.addEventListener('click', function () { t = START[k]; cur = -1; show(k); paint(); });
  });
  document.addEventListener('visibilitychange', function () { autoPaused = document.hidden; last = 0; });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { autoPaused = !es[0].isIntersecting || document.hidden; last = 0; }, { threshold: 0.15 }).observe(root);

  // ---------- 시작 ----------
  drawChart(); setPaused(userPaused); show(0); paint();
  requestAnimationFrame(tick);

  // 갤러리 기록으로 숫자 · 그래프 다시 셈 (로그인 없이 보이는 공개 기록)
  (function load(n) {
    if (!window.sb) { if (n < 40) setTimeout(function () { load(n + 1); }, 150); return; }
    Promise.all([
      window.sb.from('gallery_posts').select('event_date,created_at'),
      window.sb.from('gallery_photos').select('id', { count: 'exact', head: true })
    ]).then(function (r) {
      if (r[0].error || !r[0].data || !r[0].data.length) return;
      var years = {};
      r[0].data.forEach(function (p) { var y = +String(p.event_date || p.created_at || '').slice(0, 4); if (y) years[y] = (years[y] || 0) + 1; });
      DATA.years = years; DATA.posts = r[0].data.length;
      if (!r[1].error && r[1].count) DATA.photos = r[1].count;
      root.querySelector('[data-mv="posts"]').setAttribute('data-to', DATA.posts);
      root.querySelector('[data-mv="photos"]').setAttribute('data-to', DATA.photos);
      var was = cur; drawChart();
      if (was === 2) { lineIn(true); }
      if (was !== 1) root.querySelectorAll('.mv-kpi b[data-to]').forEach(function (b) { b.firstChild.nodeValue = n0(b.getAttribute('data-to')); });
    }).catch(function () {});
  })(0);
})();
