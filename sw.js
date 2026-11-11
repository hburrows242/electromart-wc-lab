// sw.js: the service worker. It is a small script the browser runs in the
// background so the app can open with no internet connection.
//
// Strategy: network first. Every request tries the network, so a merged change
// shows up on the next visit. Each good response is saved in the cache, and the
// cache is used only when the network fails (offline).
//
// All paths are relative, because the site lives at
// https://<username>.github.io/<repository>/, not at the root of a domain.

const CACHE = 'electromart-ccc-v1';

// The files the app needs to run offline. Saved when the app is first opened.
const FILES = [
  './',
  'index.html',
  'styles.css',
  'ccc.js',
  'app.js',
  'manifest.webmanifest',
  'data/electromart.csv',
  'data/assumptions.csv',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  // Remove caches left by older versions, then take over open pages.
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.filter(function (n) { return n !== CACHE; })
          .map(function (n) { return caches.delete(n); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  // Only handle this app's own files. The app makes no requests to other sites.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(function (res) {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        // Offline: use the saved copy. For a page load, fall back to the app's page.
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('./');
          return Response.error();
        });
      })
  );
});
