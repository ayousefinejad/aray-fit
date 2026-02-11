/* ArayFit PWA – cache-first static, network-first API */
const CACHE_NAME = "arayfit-v2";
const PRECACHE = ["/", "/css/arayfit.css", "/js/arayfit.js", "/manifest.json"];
const STATIC = /\.(css|js|html|png|svg|jpg|jpeg|gif|ico|woff|woff2)$/i;
const MEDIA = /\.(mp3|wav|ogg|m4a|aac|mp4|webm|mkv)$/i;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "CLEAR_CACHE") {
    e.waitUntil(
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
    );
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (MEDIA.test(url.pathname)) return;
  if (url.origin !== self.location.origin) return;

  if (STATIC.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((c) => c || fetch(req).then((r) => {
        if (r && r.ok) caches.open(CACHE_NAME).then((c) => c.put(req, r.clone()));
        return r;
      })).catch(() => caches.match("/"))
    );
  } else {
    e.respondWith(
      fetch(req).then((r) => {
        if (r && r.ok) caches.open(CACHE_NAME).then((c) => c.put(req, r.clone()));
        return r;
      }).catch(() => caches.match(req).then((c) => c || caches.match("/")))
    );
  }
});
