/* The Boardroom JA service worker: phone notifications only. It does not cache pages, so updates always arrive. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'The Boardroom JA', body: event.data ? event.data.text() : '' }; }
  const title = String(d.title || 'The Boardroom JA').slice(0, 120);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 200),
    icon: '/icon-192.png',
    badge: '/favicon.png',
    tag: d.tag || undefined,
    data: { link: d.link || 'tab:notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || 'tab:notifications';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (/^https:\/\//.test(link)) { await self.clients.openWindow(link); return; }
    const url = '/?open=' + encodeURIComponent(link);
    for (const c of all) {
      if ('focus' in c) { c.postMessage({ type: 'open-link', link }); return c.focus(); }
    }
    await self.clients.openWindow(url);
  })());
});
