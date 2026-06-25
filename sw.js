const CACHE_NAME = 'rupeetrail-cache-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './dashboard.html',
  './transactions.html',
  './accounts.html',
  './reports.html',
  './settings.html',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/pages.css',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/pwa.js',
  './js/state.js',
  './js/ui.js',
  './js/offline.js',
  './js/charts.js',
  './js/dashboard.js',
  './js/transactions.js',
  './js/accounts.js',
  './js/reports.js',
  'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install Event - Cache Static Assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching all static assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First, Fallback to Cache
self.addEventListener('fetch', event => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Don't cache Apps Script API
  if (event.request.url.includes('script.google.com')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone the response and update the cache for future offline use
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});

// Background Sync Event
self.addEventListener('sync', event => {
  if (event.tag === 'sync-transactions') {
    console.log('[Service Worker] Background sync triggered: sync-transactions');
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'PROCESS_SYNC_QUEUE' });
        });
      })
    );
  }
});
