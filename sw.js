
const CACHE_NAME = 'penalty-pro-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.tsx',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Try to cache core assets, but don't fail if external CDNs block opaque responses
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('Some assets failed to cache', err));
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Navigation requests: Network first, then Cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // API Calls (Google Script): Handle in Application Logic (sheetService.ts), not here.
  // We just let them pass through or fail naturally so the App can handle the error.
  if (event.request.url.includes('script.google.com')) {
    return; 
  }

  // Static Assets: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Cache valid responses
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      }).catch(e => {
          // Network failed
          return cachedResponse; 
      });
      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
