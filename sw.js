// sw.js — Always Network-First & Fresh Fetch Service Worker + Web Push & PWA Support

const CACHE_NAME = 'yahya-fresh-v2';

// Install: Immediately activate new worker
self.addEventListener('install', (event) => {
    console.log('[SW] Installing network-first service worker with push support...');
    self.skipWaiting();
});

// Activate: Immediately claim all open client tabs and clean stale caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating & claiming clients...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Always attempt network fetch first with reload/no-cache policy
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        fetch(event.request, { cache: 'no-store' })
            .then((networkResponse) => {
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// ── Web Push Notification Handler ───────────────────────────────────────────
self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);

    let data = {
        title: 'New Appointment Booking',
        body: 'A visitor has booked an appointment on yahya.in',
        url: '/#admin'
    };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const title = data.title || '📅 New Appointment Request';
    const options = {
        body: data.body || 'New booking inquiry received on yahya.in',
        icon: '/favicon.jpg',
        badge: '/favicon.jpg',
        vibrate: [250, 100, 250, 100, 250],
        data: {
            url: data.url || '/#admin'
        },
        actions: [
            { action: 'view', title: 'Open Admin' },
            { action: 'close', title: 'Dismiss' }
        ],
        tag: 'appointment-notification',
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ── Notification Click Handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/#admin';

    if (event.action === 'close') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
