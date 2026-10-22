// Minimal service worker: makes the app installable and the shell load offline. API is never cached.
const C = 'cs-v2';
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(['/', '/app.js', '/icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => { const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); });
