// Bump this whenever any cached file changes, so tablets pick up the update
// next time they have a connection (old caches are dropped on activate).
var CACHE_NAME = "job-card-v52";

var APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./src/config.js",
  "./src/firebase-config.js",
  "./src/storage.js",
  "./src/sync.js",
  "./src/App.js",
  "./src/templates/pre-purchase-inspection.js",
  "./src/templates/diagnostics.js",
  "./src/app-shell.js",
  "./src/main.js",
  "./vendor/react.production.min.js",
  "./vendor/react-dom.production.min.js",
  "./vendor/htm.js",
  "./vendor/html2canvas.min.js",
  "./vendor/jspdf.umd.min.js",
  "./vendor/firebase-app-compat.js",
  "./vendor/firebase-firestore-compat.js",
  "./vendor/firebase-storage-compat.js",
  "./vendor/firebase-auth-compat.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_NAME;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

// Cache-first: this app has no server/API to talk to, so once a file is
// cached there's no reason to hit the network for it again.
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return (
        cached ||
        fetch(event.request).then(function (response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, copy);
          });
          return response;
        })
      );
    })
  );
});
