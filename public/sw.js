/* ManhTool â€” Háº¹n giá» nháº¯c viá»‡c: cháº¡y Ä‘Æ°á»£c khi máº¥t máº¡ng.
   Æ¯u tiÃªn máº¡ng (luÃ´n láº¥y báº£n má»›i nháº¥t), máº¥t máº¡ng thÃ¬ dÃ¹ng báº£n Ä‘Ã£ lÆ°u. Äá»•i VERSION khi muá»‘n xÃ³a bá»™ nhá»› cÅ©. */
var VERSION = 'hen-gio-v16';
var SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/css/style.css', 'assets/css/stage.css', 'assets/css/account.css',
  'assets/js/boot.js', 'assets/js/api.js', 'assets/js/timer-core.js', 'assets/js/themes.js', 'assets/js/sounds.js', 'assets/js/soundscapes.js', 'assets/js/pip.js', 'assets/js/app.js', 'assets/js/account.js', 'assets/js/shop.js',
  'assets/img/mark-192.png', 'assets/img/logo-512.png', 'assets/img/donate-qr.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;
  // API tÃ i khoáº£n vÃ  trang quáº£n trá»‹ luÃ´n Ä‘i tháº³ng lÃªn mÃ¡y chá»§, khÃ´ng lÆ°u bá»™ nhá»› Ä‘á»‡m
  if (sameOrigin && (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/admin') === 0)) return;

  e.respondWith(fetch(req).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    });
  }));
});
