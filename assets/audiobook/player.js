// 삼기연 오디오북 플레이어 — 홈페이지 섹션과 QR 도착 페이지(book/…)가 함께 씁니다.
// 마크업: <div data-audiobook data-src="…mp3" data-key="santokki" data-title="…" data-artist="…" data-cover="…">
//   안에 .ab-play .ab-seek .ab-cur .ab-dur .ab-back .ab-fwd 요소를 둡니다.
(function () {
  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) {} return null; }

  function init(root) {
    var audio = new Audio();
    audio.preload = 'metadata';
    audio.src = root.getAttribute('data-src');
    var key = 'audiobook-pos-' + (root.getAttribute('data-key') || 'book');
    var q = function (s) { return root.querySelector(s); };
    var play = q('.ab-play'), seek = q('.ab-seek'), cur = q('.ab-cur'), dur = q('.ab-dur');
    var back = q('.ab-back'), fwd = q('.ab-fwd');
    var dragging = false, lastSave = 0;

    function paint() {
      var d = audio.duration || 0, t = audio.currentTime || 0;
      if (!dragging) seek.value = d ? (t / d) * 1000 : 0;
      seek.style.setProperty('--p', (seek.value / 10) + '%');
      cur.textContent = fmt(t);
      dur.textContent = d ? fmt(d) : '--:--';
    }
    function setPlaying(on) {
      root.classList.toggle('is-playing', on);
      play.setAttribute('aria-label', on ? '일시정지' : '재생');
    }

    audio.addEventListener('loadedmetadata', function () {
      var saved = parseFloat(store(key));
      // 끝 부분 30초 이내에서 멈췄다면 처음부터 다시 듣도록 합니다.
      if (saved > 5 && saved < audio.duration - 30) audio.currentTime = saved;
      paint();
    });
    audio.addEventListener('timeupdate', function () {
      paint();
      var now = Date.now();
      if (now - lastSave > 3000) { lastSave = now; store(key, String(audio.currentTime)); }
    });
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () { setPlaying(false); store(key, String(audio.currentTime)); });
    audio.addEventListener('ended', function () { setPlaying(false); store(key, '0'); });
    audio.addEventListener('waiting', function () { root.classList.add('is-loading'); });
    audio.addEventListener('playing', function () { root.classList.remove('is-loading'); });

    play.addEventListener('click', function () {
      if (audio.paused) {
        // 한 화면에 플레이어가 여럿이면 다른 것은 멈춥니다.
        document.querySelectorAll('[data-audiobook]').forEach(function (el) { if (el !== root && el._ab) el._ab.pause(); });
        audio.play();
      } else audio.pause();
    });
    back.addEventListener('click', function () { audio.currentTime = Math.max(0, audio.currentTime - 15); });
    fwd.addEventListener('click', function () { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
    seek.addEventListener('input', function () {
      dragging = true;
      seek.style.setProperty('--p', (seek.value / 10) + '%');
      if (audio.duration) cur.textContent = fmt(seek.value / 1000 * audio.duration);
    });
    seek.addEventListener('change', function () {
      dragging = false;
      if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration;
    });

    // 잠금화면·이어폰 버튼 제어
    if ('mediaSession' in navigator) {
      audio.addEventListener('play', function () {
        var cover = root.getAttribute('data-cover');
        navigator.mediaSession.metadata = new MediaMetadata({
          title: root.getAttribute('data-title') || '',
          artist: root.getAttribute('data-artist') || '',
          artwork: cover ? [{ src: new URL(cover, location.href).href, sizes: '720x1008', type: 'image/jpeg' }] : []
        });
        try {
          navigator.mediaSession.setActionHandler('seekbackward', function () { back.click(); });
          navigator.mediaSession.setActionHandler('seekforward', function () { fwd.click(); });
        } catch (_) {}
      });
    }

    root._ab = audio;
    paint();
  }

  function boot() { document.querySelectorAll('[data-audiobook]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
