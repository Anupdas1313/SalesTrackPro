// SalesLink - Modern High-Performance PWA Service Worker
const CACHE_NAME = 'saleslink-v1';

// Core shell assets to pre-cache on install
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './js/app.js',
    './js/db.js',
    './js/firebase-config.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/icon.svg',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/vue@3/dist/vue.global.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

// Install Event: Pre-cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Attempt to cache all, ignore non-fatal single resource failures
            return Promise.allSettled(
                PRECACHE_ASSETS.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn(`[SW] Non-fatal precache skip for: ${url}`, err);
                    })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate Event: Clear outdated caches and claim clients immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log(`[SW] Removing outdated cache: ${name}`);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Smart routing & caching strategies
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Only process GET requests
    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);

    // Bypass Firebase / Firestore APIs (Firebase SDK handles its own internal offline queue/IndexedDB)
    if (
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firestore') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('identitytoolkit')
    ) {
        return;
    }

    // Strategy 1: External CDN static assets (Fonts, Icons, Scripts) -> Cache-first with network fallback
    if (
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('cdn.tailwindcss.com') ||
        url.hostname.includes('unpkg.com') ||
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('sheetjs.com')
    ) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // If offline and not in cache, fallback gracefully
                    return cachedResponse || new Response('', { status: 408, statusText: 'Offline' });
                });
            })
        );
        return;
    }

    // Strategy 2: Local app assets & HTML documents -> Network-first with Cache fallback
    // Ensures fresh updates while online, and instant load from cache when in dead zones / slow Wi-Fi
    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(async () => {
                // Network failed (offline / dealership dead zone) -> Serve from cache
                const cachedResponse = await caches.match(request);
                if (cachedResponse) {
                    return cachedResponse;
                }

                // If navigating to an HTML page, serve cached index.html as fallback
                if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
                    const indexFallback = await caches.match('./index.html');
                    if (indexFallback) {
                        return indexFallback;
                    }
                }

                return new Response('Offline: Connection lost. Reconnect to sync data.', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain' }
                });
            })
    );
});
