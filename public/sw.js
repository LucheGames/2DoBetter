const CACHE_NAME = '2dobetter-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge ALL old caches (including v2 which cached authenticated pages)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always network-only (never cache auth or data responses)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigation requests (HTML pages): always network-only.
  // SECURITY: the proxy uses rewrites (not redirects) for auth gating,
  // so an authenticated response cached at "/" would be served to
  // unauthenticated requests from the SW cache. Never cache navigations.
  if (event.request.mode === 'navigate') {
    return;
  }

  // Static assets only (_next/static, icons, fonts, manifest):
  // network first, fall back to cache for offline resilience.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
