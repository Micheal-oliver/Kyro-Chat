/* Network-first service worker: always fetches fresh files, falls back to cache offline.
   Also receives items shared from other apps (manifest share_target) and hands them to app.html. */
const CACHE = "kyro-shell-v5";
const SHARE = "kyro-share";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function takeShare(req) {
  try {
    const fd = await req.formData();
    const c = await caches.open(SHARE);
    await Promise.all((await c.keys()).map((k) => c.delete(k)));
    const meta = { title: String(fd.get("title") || ""), text: String(fd.get("text") || ""), url: String(fd.get("url") || ""), files: [], at: Date.now() };
    let i = 0;
    for (const f of fd.getAll("media")) {
      if (!f || !f.size) continue;
      const key = "/__share/file/" + i++;
      await c.put(key, new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream" } }));
      meta.files.push({ key, type: f.type || "", name: f.name || "file" });
    }
    await c.put("/__share/meta", new Response(JSON.stringify(meta)));
  } catch (_) {}
  return Response.redirect(new URL("app.html?share=1", self.registration.scope).href, 303);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/share-target")) {
    e.respondWith(takeShare(req));
    return;
  }
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
