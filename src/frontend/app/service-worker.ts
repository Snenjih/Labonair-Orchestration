/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  if (!e.data) { return; }
  let payload: { title?: string; body?: string; data?: { sessionId?: string; requestId?: string } };
  try { payload = e.data.json(); } catch { payload = { title: 'Labonair Bridge', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(payload.title ?? 'Labonair Bridge', {
      body: payload.body ?? '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'labonair-permission',
      renotify: true,
      data: payload.data,
      actions: [
        { action: 'allow', title: 'Allow' },
        { action: 'deny', title: 'Deny' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data as { sessionId?: string } | undefined;
  const url = data?.sessionId ? `/?#chat/${data.sessionId}` : '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing && 'focus' in existing) {
        existing.postMessage({ type: 'notification_action', action: e.action, data });
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

// Offline fallback
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Labonair Bridge</title></head>
          <body style="font-family:system-ui;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
          <div><div style="font-size:48px;margin-bottom:16px">📡</div><h2>Bridge Unreachable</h2>
          <p style="opacity:0.5;margin-top:8px">Make sure Labonair is running and Bridge is enabled.</p>
          <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;border-radius:10px;border:none;background:#0e639c;color:#fff;font-size:14px;cursor:pointer">Retry</button>
          </div></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        )
      )
    );
  }
});
