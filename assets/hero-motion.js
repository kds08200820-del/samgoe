// ============================================================
//  삼기연 첫 화면 — 영상처럼 움직이는 히어로 (assets/hero-motion.css)
//  4장면을 19초 동안 차례로 보여 주고 되풀이합니다. 숫자는 세어 올라가고, 절기 막대는 차례로 자랍니다.
//  · 숫자 · 연도는 자료실 기록(총회자료 · 회의록 · 행사 보고)에서 옮겨 index.html 에 적었습니다
//  · 화면 밖이거나 다른 탭을 보면 멈추고, '움직임 줄이기' 설정이면 자동 재생하지 않습니다
// ============================================================
(function () {
  var root = document.getElementById('mv'); if (!root) return;
  var scenes = Array.prototype.slice.call(root.querySelectorAll('.mv-scene'));
  var chaps = Array.prototype.slice.call(root.querySelectorAll('.mv-chap button'));
  var DUR = [3600, 4600, 5200, 5600], TOTAL = DUR.reduce(function (a, b) { return a + b; }, 0);
  var START = DUR.map(function (_, i) { return DUR.slice(0, i).reduce(function (a, b) { return a + b; }, 0); });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t = 0, cur = -1, userPaused = !!reduce, autoPaused = false, last = 0;

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

  // ---------- 장면 전환 ----------
  function show(i) {
    if (i === cur) return;
    cur = i;
    scenes.forEach(function (s, k) { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    chaps.forEach(function (c, k) { c.classList.toggle('on', k === i); });
    if (i === 1) countUp();
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
  setPaused(userPaused); show(0); paint();
  requestAnimationFrame(tick);
})();
