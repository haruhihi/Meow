const CACHE_PREFIX = 'meow-static-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;

const CACHEABLE_PATHS = new Set([
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
  '/web-app-maskable-192x192.png',
  '/web-app-maskable-512x512.png',
  '/manifest.webmanifest',
  '/manifest.json',
]);

const isCacheableStaticRequest = (request) => {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;

  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.startsWith('/_next/image')) return request.destination === 'image';
  if (CACHEABLE_PATHS.has(url.pathname)) return true;

  return false;
};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME ? caches.delete(key) : undefined))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!isCacheableStaticRequest(request)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    }),
  );
});