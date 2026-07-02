// 삼기연 홈페이지 — 서비스 워커 (앱 설치 + 오프라인 기본 지원)
var CACHE = 'samgoe-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 같은 도메인(홈페이지) GET 요청만 관여: 네트워크 우선, 실패하면 캐시.
// Supabase/Cloudflare(R2)/CDN 등 외부 요청은 건드리지 않아 로그인·데이터는 항상 최신입니다.
self.addEventListener('fetch', function (e) {
  var url;
  try { url = new URL(e.request.url); } catch (_) { return; }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      try { var c = res.clone(); caches.open(CACHE).then(function (ca) { ca.put(e.request, c); }); } catch (_) {}
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
