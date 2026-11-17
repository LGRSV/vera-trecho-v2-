// Missão PC-TO — service worker: offline + notificações.
const CACHE = "missaopcto-v1";
const ARQUIVOS = ["./", "index.html", "js/app.js", "js/engine.js", "data/questoes.json", "data/plano.json",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rede primeiro (para pegar atualizações); se estiver offline, usa o cache.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
// Envio pela nuvem (Supabase → Web Push): chega mesmo com o app fechado.
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { titulo: "Missão PC-TO", corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Missão PC-TO",
    { body: d.corpo || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: d.id || "pcto", data: { abrir: d.abrir || "#hoje" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = new URL("./" + (e.notification.data?.abrir || "#hoje"), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { c.navigate(alvo); return c.focus(); }
    return self.clients.openWindow(alvo);
  }));
});
