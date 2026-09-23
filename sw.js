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

// シンプルな和紙風アイコン（SVGをそのままdata URIとして使用。画像ファイルの用意が不要）
const NOTIF_ICON = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="18" fill="#26313E"/>
  <text x="50" y="66" font-size="52" text-anchor="middle" fill="#EFE9DB" font-family="sans-serif">単</text>
</svg>
`);

let appIsVisible = false;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'visibility') {
    appIsVisible = !!event.data.visible;
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  const data = payload.data || payload;
  const title = data.title || '単語壁打ち帳';
  const body = data.body || '復習の時間です';

  event.waitUntil(
    (async () => {
      // アプリが今フォアグラウンドで表示中なら、通知は出さない
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const hasVisibleClient = clientList.some(c => c.visibilityState === 'visible');
      if (hasVisibleClient || appIsVisible) {
        return;
      }
      return self.registration.showNotification(title, {
        body,
        icon: NOTIF_ICON,
        badge: NOTIF_ICON,
        tag: 'vocab-review',
        renotify: true,
        data,
        actions: [
          { action: 'known', title: '✓ 覚えた' },
          { action: 'unknown', title: '✕ まだ' }
        ]
      });
    })()
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
    // 通知本体タップ: その単語のカードをアプリ上で開けるよう、クエリ付きで開く
    const url = './?review=' + encodeURIComponent(data.wordId || '') + '&dir=' + encodeURIComponent(data.direction || 'je');
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({ type: 'open-review', wordId: data.wordId, direction: data.direction });
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
    );
  }
});
