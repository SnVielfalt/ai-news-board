// NAIS の Service Worker：新しい号の通知と、ホーム画面アイコンの印（バッジ）だけを扱う。
// ページの保存（オフライン化）はしない（古い内容が残るのを避けるため）。
// 版：2026-11-14.22（この行が変わると端末側の sw.js も更新される）
self.addEventListener("install", () => self.skipWaiting());

// ページ本体（HTML）は毎回サーバーから取る。ホーム画面アプリが古い版を使い続けるのを防ぐ
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  event.respondWith(fetch(req, { cache: "no-store" }).catch(() => fetch(req)));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || "NAIS";
  const options = {
    body: data.body || "新しい号が届きました",
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    tag: data.tag || "nais-issue",
    data: { url: data.url || "./" }
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    // アイコンの印：対応環境だけ。数は届いた通知の数
    (self.navigator && self.navigator.setAppBadge)
      ? self.registration.getNotifications().then((ns) => self.navigator.setAppBadge(Math.max(1, ns.length))).catch(() => {})
      : Promise.resolve()
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) { try { await c.navigate(url); } catch (e) {} } return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
