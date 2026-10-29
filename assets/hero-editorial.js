// One clock drives chapters and numbers; paused or hidden heroes do no frame work.
(function () {
  'use strict';
  var root = document.getElementById('mv');
  if (!root) return;
  var hero = root.closest('.hero');
  var scenes = Array.from(root.querySelectorAll('.mv-scene'));
  var buttons = Array.from(root.querySelectorAll('.mv-chap button'));
  var play = root.querySelector('.mv-play');
  var index = document.getElementById('mvIndex');
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var duration = [9000, 10000, 11000, 12000];
  var start = duration.map(function (_, i) { return duration.slice(0, i).reduce(function (a, b) { return a + b; }, 0); });
  var total = duration.reduce(function (a, b) { return a + b; }, 0);
  var time = 0, current = -1, last = 0, frame = 0;
  var paused = motion.matches, inView = true;
  var numbers = Array.from(root.querySelectorAll('[data-to]'));

  function visible() { return inView && !document.hidden && !hero.classList.contains('walk-focus'); }
  function canPlay() { return !paused && visible(); }
  function show(i) {
    if (current === i) return;
    current = i;
    scenes.forEach(function (scene, k) {
      scene.classList.toggle('on', k === i);
      scene.setAttribute('aria-hidden', String(k !== i));
      scene.inert = k !== i;
    });
    buttons.forEach(function (button, k) {
      button.classList.toggle('on', k === i);
      button.setAttribute('aria-pressed', String(k === i));
    });
    index.textContent = String(i + 1).padStart(2, '0');
    root.dataset.scene = String(i);
  }
  function paint() {
    buttons.forEach(function (button, k) {
      var progress = k < current ? 1 : k > current ? 0 : Math.min(1, (time - start[k]) / duration[k]);
      button.querySelector('i').style.width = (progress * 100).toFixed(2) + '%';
    });
    if (current === 1) numbers.forEach(function (number, i) {
      var progress = motion.matches ? 1 : Math.max(0, Math.min(1, (time - start[1] - 200 - i * 100) / 1600));
      number.firstChild.nodeValue = Math.round(Number(number.dataset.to) * (1 - Math.pow(1 - progress, 3))).toLocaleString('ko-KR');
    });
  }
  function tick(now) {
    frame = 0;
    if (!canPlay()) { sync(); return; }
    if (last) time = (time + Math.min(now - last, 100)) % total;
    last = now;
    var next = start.length - 1;
    while (next > 0 && time < start[next]) next--;
    show(next); paint();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    var active = canPlay();
    root.classList.toggle('paused', paused);
    root.classList.toggle('motion-still', !active);
    play.setAttribute('aria-label', paused ? '이야기 자동 재생' : '이야기 움직임 멈춤');
    play.setAttribute('aria-pressed', String(paused));
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (active) frame = requestAnimationFrame(tick);
  }
  function select(i) {
    time = start[i]; paused = true;
    show(i);
    // Manual navigation shows complete figures immediately for comfortable reading.
    if (i === 1) time += 2000;
    paint(); sync();
  }
  play.addEventListener('click', function () { paused = !paused; sync(); });
  buttons.forEach(function (button, i) {
    button.addEventListener('click', function () { select(i); });
    button.addEventListener('keydown', function (event) {
      var next = i;
      if (event.key === 'ArrowRight') next = (i + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') next = (i + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault(); buttons[next].focus(); select(next);
    });
  });
  root.addEventListener('focusin', function (event) {
    if (event.target !== play && !paused) { paused = true; sync(); }
  });
  hero.addEventListener('pointermove', function (event) {
    if (event.pointerType !== 'mouse' || motion.matches || paused || !visible()) return;
    var rect = hero.getBoundingClientRect();
    root.style.setProperty('--art-x', ((event.clientX - rect.left) / rect.width * 10 - 5).toFixed(2) + 'deg');
    root.style.setProperty('--art-y', (3 - (event.clientY - rect.top) / rect.height * 6).toFixed(2) + 'deg');
  }, { passive: true });
  hero.addEventListener('pointerleave', function () {
    if (!paused) { root.style.setProperty('--art-x', '0deg'); root.style.setProperty('--art-y', '0deg'); }
  });
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (entries) {
    inView = entries[0].isIntersecting; sync();
  }, { threshold: .05 }).observe(hero);
  new MutationObserver(sync).observe(hero, { attributes: true, attributeFilter: ['class'] });
  motion.addEventListener('change', function () { paused = motion.matches; paint(); sync(); });
  show(0); paint(); sync();
})();
