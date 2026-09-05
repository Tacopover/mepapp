// Step 5 (offline caching, browser case): a network-first service worker for
// this app's own same-origin assets, including the mupdf WASM bundle. Every
// successful network response is cached; when there's no network at all, the
// cached copy is served instead — so a session that loaded once can later
// open, edit, and save fully offline.
//
// Scope is deliberately narrow: same-origin GET requests only. Anything
// cross-origin, or a non-GET request, always goes straight to the network —
// this worker has no opinion about those.
const CACHE_NAME = 'mepapp-offline-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (networkError) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw networkError;
      }
    })(),
  );
});
