// 삼일만세운동본부 앱 설치 버튼 — 설치할 수 있을 때만 [data-install] 버튼을 보여 줍니다.
(function () {
  var btns = document.querySelectorAll('[data-install]');
  var deferred = null;
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  function show(on) { btns.forEach(function (b) { b.hidden = !on; }); }
  if (standalone) return;                       // 이미 앱으로 실행 중
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; show(true); });
  window.addEventListener('appinstalled', function () { deferred = null; show(false); });
  if (ios) show(true);                          // 아이폰은 안내창으로
  btns.forEach(function (b) {
    b.addEventListener('click', async function () {
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (_) {}
        deferred = null; show(false);
      } else if (ios) {
        var tip = document.getElementById('iosTip'); if (tip) tip.style.display = 'flex';
      }
    });
  });
})();
