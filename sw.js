// sw.js — Always Network-First & Fresh Fetch Service Worker

const CACHE_NAME = 'yahya-fresh-v1';

// Install: Immediately activate new worker
self.addEventListener('install', (event) => {
    console.log('[SW] Installing network-first service worker...');
    self.skipWaiting();
});

// Activate: Immediately claim all open client tabs and wipe any stored caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating & clearing old caches...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    console.log('[SW] Deleting cache:', cache);
                    return caches.delete(cache);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Always attempt network fetch first with reload/no-cache policy
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests or browser extension requests
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        fetch(event.request, { cache: 'no-store' })
            .then((networkResponse) => {
                return networkResponse;
            })
            .catch(() => {
                // If offline or network error, fallback to cache if available
                return caches.match(event.request);
            })
    );
});
