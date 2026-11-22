// SalesLink Single Version Source of Truth
// Synchronizes ServiceWorker cache, app bundle, and registration query strings
self.APP_VERSION = '1.4.1';
self.CACHE_NAME = 'saleslink-v1.4.1';

if (typeof window !== 'undefined') {
    window.APP_VERSION = self.APP_VERSION;
    window.CACHE_NAME = self.CACHE_NAME;
}
