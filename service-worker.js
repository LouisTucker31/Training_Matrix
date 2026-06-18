/* ============================================================
   Training Matrix - service-worker.js
   Offline cache. Bump CACHE_VERSION when any cached file changes.
   The cached paths MUST exactly match the files referenced in
   index.html and manifest.json (same relative paths, same names).
   ============================================================ */

const CACHE_VERSION = 'training-matrix-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

/* Install: pre-cache the app shell. */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* Activate: clean up old caches. */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_VERSION; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Fetch: cache-first for same-origin GET requests, with a network
   fallback that updates the cache. Cross-origin requests (fonts)
   fall through to the network. */
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    // Let cross-origin (e.g. Google Fonts) use the network; cache opportunistically.
    event.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (res) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () { return cached; });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        // Offline navigation fallback to the app shell.
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
