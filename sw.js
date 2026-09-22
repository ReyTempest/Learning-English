const CACHE_NAME = 'vocab-ledger-shell-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./')))
  );
});

// ---- プッシュ通知の受信 ----
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  const data = payload.data || payload;
  const title = data.title || '単語壁打ち帳';
  const body = data.body || '復習の時間です';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: 'vocab-review',
      renotify: true,
      data,
      actions: [
        { action: 'known', title: '✓ 覚えた' },
        { action: 'unknown', title: '✕ まだ' }
      ]
    })
  );
});

// ---- 通知のボタン操作 ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;
  if (action === 'known' || action === 'unknown') {
    if (data.gasUrl) {
      event.waitUntil(
        fetch(data.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'reviewResult',
            wordId: data.wordId,
            direction: data.direction,
            known: action === 'known'
          })
        }).catch(() => {})
      );
    }
  } else {
    event.waitUntil(clients.openWindow('./'));
  }
});
