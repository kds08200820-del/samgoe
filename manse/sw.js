// 삼일만세운동본부 앱 — 서비스워커 (범위: /manse/)
// 같은 주소의 페이지·사진은 '네트워크 우선, 실패하면 저장본'으로 보여 줍니다.
// 로그인·임원방 데이터(Supabase)와 외부 주소, 영상·음성(부분 요청)은 건드리지 않습니다.
var CACHE = 'manse-v1';
var CORE = ['./', 'archive/archive.css', 'archive/archive.js', 'archive/data.js', 'img/logo-192.png', 'img/logo.png', 'manse.css'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('manse-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url;
  try { url = new URL(e.request.url); } catch (_) { return; }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (e.request.headers.has('range') || /\.(mp3|mp4|m4a)$/i.test(url.pathname)) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); })
  );
});
