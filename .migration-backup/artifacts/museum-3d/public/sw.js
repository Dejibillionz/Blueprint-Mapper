const META_CACHE  = "museum-meta-v1";
const NFT_CACHE   = "museum-nft-v1";
const SHELL_CACHE = "museum-shell-v1";

const KNOWN_CACHES = [META_CACHE, NFT_CACHE, SHELL_CACHE];

// Populated at build time by the inject-sw-shell-assets Vite plugin.
// Empty during local dev — runtime caching still covers assets loaded mid-session.
const SHELL_ASSETS = [];

const CDN_HOSTS = [
  "i.seadn.io",
  "openseauserdata.com",
  "storage.googleapis.com",
  "nftstorage.link",
  "ipfs.io",
  "cloudflare-ipfs.com",
];

const SHELL_EXTENSIONS = new Set([
  ".js", ".css", ".woff", ".woff2", ".ttf", ".svg", ".ico", ".webp", ".png", ".jpg", ".jpeg",
]);

function isShellAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  for (const ext of SHELL_EXTENSIONS) {
    if (path.endsWith(ext)) return true;
  }
  return false;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const [metaCache, shellCache] = await Promise.all([
        caches.open(META_CACHE),
        caches.open(SHELL_CACHE),
      ]);

      // Metadata — non-fatal if offline at install time
      await metaCache.add("/metadata.json").catch(() => {});

      // App shell: index.html (via scope) + all hashed JS/CSS from manifest.
      // addAll is atomic so add each URL individually — one failure won't abort the rest.
      const shellUrls = [self.registration.scope, ...SHELL_ASSETS];
      await Promise.allSettled(shellUrls.map((url) => shellCache.add(url)));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !KNOWN_CACHES.includes(k))
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

  // Navigation requests (HTML page loads) — network-first with shell fallback
  if (event.request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirstWithShellFallback(event.request));
    return;
  }

  // Same-origin static assets (JS, CSS, fonts, images) — cache-first
  // Covers both build-time pre-cached assets and any loaded during the session
  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  // Local /nft-images/* assets are fast (disk/edge) — pass through, no SW cache needed.

  if (CDN_HOSTS.some((h) => url.hostname.includes(h))) {
    event.respondWith(cacheFirst(event.request, NFT_CACHE));
    return;
  }
});

async function networkFirstWithShellFallback(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Fall back to root scope (index.html) for any unmatched navigation
    const root = await cache.match(self.registration.scope);
    if (root) return root;
    return new Response("Offline — museum unavailable", { status: 503 });
  }
}

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
