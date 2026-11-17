
const CACHE_STATIC_NAME = 'static-outbox-v1';

const STATIC_FILES = [
    './',
    './index.html',
    './styles.css',
    './db-helper.js',
    './app.js',
    './manifest.json'
];

// Instalación
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME)
        .then((cache) => cache.addAll(STATIC_FILES))
        .then(() => self.skipWaiting())
    );
});

// Activación
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
        .then((nombres) => Promise.all(
            nombres
            .filter((n) => n !== CACHE_STATIC_NAME)
            .map((n) => caches.delete(n))
        ))
        .then(() => self.clients.claim())
    );
});

// Fetch
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    if (new URL(event.request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
        .then((enCache) => enCache || fetch(event.request))
    );
});
