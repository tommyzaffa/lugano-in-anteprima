/* Service worker minimale: tiene in cache l'interfaccia e la cartografia già vista
   per consultare offline i riepiloghi salvati. Le chiamate /api non sono mai servite
   dalla cache (nessuna garanzia live offline). */
const CACHE = 'lia-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest']))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request);
    const net = fetch(e.request).then((res) => { if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/tiles/') || url.pathname.startsWith('/glyphs/') || url.pathname === '/')) cache.put(e.request, res.clone()); return res; }).catch(() => hit || (e.request.mode === 'navigate' ? cache.match('/') : undefined));
    return hit || net;
  }));
});
