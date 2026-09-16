// StreetsEmpire service worker: shows alerts pushed by the game server.
// Deliberately no fetch handler and no caching, so it can never serve a stale build.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
