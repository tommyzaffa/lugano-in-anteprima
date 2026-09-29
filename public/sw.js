/* Service worker minimale: tiene in cache l'interfaccia e la cartografia già vista
   per consultare offline i riepiloghi salvati. Le chiamate /api non sono mai servite
   dalla cache (nessuna garanzia live offline).
   La pagina (navigazione) va prima in rete, così dopo un aggiornamento del server si vede
   subito la versione nuova; la copia in cache serve solo senza rete. Script e stili hanno
   un nome con impronta (immutabili), tile e glifi cambiano solo con un nuovo import dei dati. */
const CACHE = 'lia-v4';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest']))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok && url.pathname === '/') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); }
      return res;
    }).catch(() => caches.open(CACHE).then((c) => c.match('/'))));
    return;
  }
  const immutable = url.pathname.startsWith('/assets/');
  if (!immutable && !url.pathname.startsWith('/tiles/') && !url.pathname.startsWith('/glyphs/')) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request);
    if (hit && immutable) return hit;
    // tile e glifi: si risponde dalla cache e si aggiorna in background
    const net = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; });
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
});
