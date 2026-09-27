// StreetsEmpire service worker: phone alerts, and an honest offline page.
//
// 1.0.0-G. It caches exactly one thing: the offline page (and the icon it shows).
// Page loads go to the network as always; only when the network is unreachable does
// the player get "you're offline" instead of the browser's error. The game build,
// its scripts and every API answer are never cached, so this can never serve a
// stale build or pretend the game works offline.

const OFFLINE_CACHE = 'se-offline-v1';
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    // `reload` skips the HTTP cache, so the offline page is the current one.
    await cache.addAll(OFFLINE_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== OFFLINE_CACHE) await caches.delete(name);
    // Faster navigations where supported; the fetch below still decides.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  // The offline page's own icon, so it shows while offline.
  if (request.mode !== 'navigate' && url.pathname !== OFFLINE_URL && OFFLINE_ASSETS.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(url.pathname)) || Response.error()));
    return;
  }
  // Otherwise only page loads of this site. Everything else goes straight to the network untouched.
  if (request.mode !== 'navigate' || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      if (preloaded) return preloaded;
      return await fetch(request);
    } catch {
      const offline = await caches.match(OFFLINE_URL);
      return offline || new Response('StreetsEmpire is offline.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'StreetsEmpire', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      // A replaced alert (same tag) still buzzes the phone.
      renotify: Boolean(data.tag),
      data: { url: data.url || '/game' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/game', self.location.origin);
  // Only ever open this site.
  const url = target.origin === self.location.origin ? target.href : new URL('/game', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      if ('navigate' in open) {
        try {
          await open.navigate(url);
          return;
        } catch {
          // Uncontrolled windows can't be navigated; fall through to a new one.
        }
      }
    }
    await self.clients.openWindow(url);
  })());
});
