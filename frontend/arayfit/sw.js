/* ArayFit PWA – Smart Caching Strategy */

// ═══════════════════════════════════════════════════════════
// Cache Configuration
// ═══════════════════════════════════════════════════════════
const VERSION = '1.0.0';
const CACHE_PREFIX = 'arayfit';
const CACHE_STATIC = `${CACHE_PREFIX}-static-${VERSION}`;
const CACHE_DYNAMIC = `${CACHE_PREFIX}-dynamic`;
const CACHE_API = `${CACHE_PREFIX}-api`;

// Files to precache on install
const PRECACHE_URLS = [
  '/',
  '/css/arayfit.css',
  '/js/arayfit.js',
  '/manifest.json'
];

// Cache duration (in milliseconds)
const CACHE_DURATION = {
  static: 7 * 24 * 60 * 60 * 1000,  // 7 days
  dynamic: 24 * 60 * 60 * 1000,      // 1 day
  api: 5 * 60 * 1000                 // 5 minutes
};

// File type patterns
const PATTERNS = {
  static: /\.(css|js|html|png|svg|jpg|jpeg|gif|ico|woff|woff2)$/i,
  media: /\.(mp3|wav|ogg|m4a|aac|mp4|webm|mkv)$/i,
  api: /^\/api\//
};

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

function log(msg, ...args) {
  console.log(`[SW ${VERSION}]`, msg, ...args);
}

async function cleanOldCaches() {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(name => 
    name.startsWith(CACHE_PREFIX) && 
    name !== CACHE_STATIC && 
    name !== CACHE_DYNAMIC && 
    name !== CACHE_API
  );
  await Promise.all(oldCaches.map(name => {
    log('Deleting old cache:', name);
    return caches.delete(name);
  }));
}

async function isCacheExpired(response, maxAge) {
  if (!response) return true;
  const cachedTime = response.headers.get('sw-cached-time');
  if (!cachedTime) return true;
  return Date.now() - parseInt(cachedTime) > maxAge;
}

async function addToCache(cacheName, request, response) {
  if (!response || response.status !== 200 || response.type === 'error') {
    return response;
  }
  
  const responseToCache = response.clone();
  const headers = new Headers(responseToCache.headers);
  headers.append('sw-cached-time', Date.now().toString());
  
  const cachedResponse = new Response(responseToCache.body, {
    status: responseToCache.status,
    statusText: responseToCache.statusText,
    headers: headers
  });
  
  const cache = await caches.open(cacheName);
  await cache.put(request, cachedResponse);
  return response;
}

// ═══════════════════════════════════════════════════════════
// Service Worker Lifecycle
// ═══════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
  log('Installing...');
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        log('Precaching static files');
        return cache.addAll(PRECACHE_URLS);
      })
      .catch(err => log('Precache failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  log('Activating...');
  
  event.waitUntil(
    cleanOldCaches()
      .then(() => self.clients.claim())
      .then(() => log('Activated successfully'))
  );
});

// ═══════════════════════════════════════════════════════════
// Message Handler (for manual cache clearing)
// ═══════════════════════════════════════════════════════════

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    log('Clearing all caches...');
    event.waitUntil(
      caches.keys()
        .then(names => Promise.all(names.map(name => caches.delete(name))))
        .then(() => log('All caches cleared'))
    );
  }
});

// ═══════════════════════════════════════════════════════════
// Fetch Strategies
// ═══════════════════════════════════════════════════════════

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;
  
  // Skip media files (too large for cache)
  if (PATTERNS.media.test(url.pathname)) return;
  
  // Strategy 1: API requests - Network First with Cache Fallback
  if (PATTERNS.api.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(response => addToCache(CACHE_API, request, response))
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached && !await isCacheExpired(cached, CACHE_DURATION.api)) {
            log('Serving stale API cache:', url.pathname);
            return cached;
          }
          throw new Error('Network failed and no valid cache');
        })
    );
    return;
  }
  
  // Strategy 2: Static files - Cache First with Network Fallback
  if (PATTERNS.static.test(url.pathname)) {
    event.respondWith(
      caches.match(request)
        .then(async (cached) => {
          if (cached && !await isCacheExpired(cached, CACHE_DURATION.static)) {
            return cached;
          }
          return fetch(request).then(response => 
            addToCache(CACHE_STATIC, request, response)
          );
        })
        .catch(() => caches.match('/'))
    );
    return;
  }
  
  // Strategy 3: HTML pages - Network First with Cache Fallback
  event.respondWith(
    fetch(request)
      .then(response => addToCache(CACHE_DYNAMIC, request, response))
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || caches.match('/');
      })
  );
});
