// Service worker. build.mjs replaces the two placeholders below; never edit
// the precache list by hand -- it is every file in dist/.
const VERSION = '__BUILD_VERSION__';
const PRECACHE = __PRECACHE_LIST__;
const CACHE = 'fidget-box-' + VERSION;

self.addEventListener('install', event => {
  // cache: 'reload' skips the HTTP cache so a new version never stores stale files.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))));
  // No skipWaiting() here: the page shows the toast and the user decides.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Any page navigation (/, /index.html, /?source=pwa, /#spinner) gets the cached shell.
    if (req.mode === 'navigate') return (await cache.match('./')) || fetch(req);
    return (await cache.match(req, { ignoreSearch: true })) || fetch(req);
  })());
});
