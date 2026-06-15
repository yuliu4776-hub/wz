const CACHE_NAME = 'robo-track-v2';
const APP_SHELL = [
  './robots.html',
  './manifest.json',
  './assets/css/app.css',
  './assets/observability.js',
  './assets/vendor-loader.js',
  './assets/sw-register.js',
  './assets/js/app/utils.js',
  './assets/js/app/state.js',
  './assets/js/app/bootstrap.js',
  './assets/js/app/data.js',
  './assets/js/app/router.js',
  './assets/js/app/views-list.js',
  './assets/js/app/views-detail.js',
  './assets/js/app/scanner.js',
  './assets/js/app/labels.js',
  './assets/js/app/inventory.js',
  './assets/js/app/views-add.js',
  './assets/js/app/views-config.js',
  './assets/js/app/index.js',
  './icon-192.png',
  './icon-512.png'
];

// Install: cache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first, fall back to cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
