const META_CACHE = "museum-meta-v1";
const NFT_CACHE  = "museum-nft-v1";

const CDN_HOSTS = [
  "i.seadn.io",
  "openseauserdata.com",
  "storage.googleapis.com",
  "nftstorage.link",
  "ipfs.io",
  "cloudflare-ipfs.com",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(META_CACHE)
      .then((cache) => cache.add("/metadata.json"))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== META_CACHE && k !== NFT_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.pathname.endsWith("/metadata.json")) {
    event.respondWith(staleWhileRevalidate(event.request, META_CACHE));
    return;
  }

  // Local /nft-images/* assets are fast (disk/edge) — pass through, no SW cache needed.

  if (CDN_HOSTS.some((h) => url.hostname.includes(h))) {
    event.respondWith(cacheFirst(event.request, NFT_CACHE));
    return;
  }
});

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return (
    cached ??
    (await networkPromise) ??
    new Response("Offline — resource unavailable", { status: 503 })
  );
}

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    cache.put(request, response.clone());
  }
  return response;
}
