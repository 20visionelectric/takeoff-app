// Offline cache for 20 Vision Material Take Off. Version 1cf9cec89d
const CACHE = "tv-1cf9cec89d";
const FILES = ["./", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "index.html", "manifest.webmanifest", "platform-desktop.js", "platform-post.js", "platform-pre.js", "vendor/jszip.min.js", "vendor/pdf-lib.min.js", "vendor/pdf.min.mjs", "vendor/pdf.worker.min.mjs"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./"))));
});
