/*
 * RMPAC service worker.
 *
 * Caching policy, and why each part of it is the way it is:
 *
 *  - Fingerprinted build assets are immutable, so they are served cache-first.
 *  - Public HTML and data are served network-first with a short timeout. A
 *    visitor standing at the side of a road on a weak signal gets the last
 *    known results rather than a spinner, and the page tells them it is stale.
 *  - Nothing under /admin, /api (other than nothing at all), or any request
 *    carrying credentials is ever read from or written to the cache. That
 *    exclusion is the single most important rule here: a shared device must not
 *    be able to serve one volunteer's admin page to the next person.
 *  - Only GET requests are considered. A mutation must never be replayed.
 */

const CACHE_VERSION = 'rmpac-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

/** Brand assets and the offline fallback, precached on install. */
const SHELL_ASSETS = [
  '/offline',
  '/rmpac-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',
];

/** How long to wait for the network before falling back to a cached page. */
const NETWORK_TIMEOUT_MS = 3500;

/** Paths that must never touch the cache, in either direction. */
const NEVER_CACHE = [/^\/admin(\/|$)/, /^\/api\//];

function isPrivatePath(pathname) {
  return NEVER_CACHE.some((pattern) => pattern.test(pathname));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // A missing shell asset must not block activation; the app still works.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Clears cached pages on request from the application.
 *
 * The unlock page sends this whenever it loads. That covers both cases where a
 * device should stop being able to read club results offline: someone locking a
 * shared computer, and the club rotating the passcode so a device that used to
 * be unlocked no longer is. Without it, a locked-out device could still read the
 * last cached standings by going offline.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_PAGE_CACHE') {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is ever cacheable. Anything else goes straight to the network so
  // a form submission can never be served from, or written to, a cache.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin requests are left entirely alone.
  if (url.origin !== self.location.origin) return;

  // Admin and API responses bypass the worker completely.
  if (isPrivatePath(url.pathname)) return;

  // The unlock page is never cached. Caching it would risk serving it in place
  // of real content, and it is the one page that must always reflect whether
  // this device is currently allowed in.
  if (url.pathname === '/unlock') return;

  // Next.js build output is content-hashed, so it can be cached forever.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Brand assets and icons.
  if (url.pathname.startsWith('/icons/') || url.pathname === '/rmpac-logo.png') {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Public pages.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && isCacheable(response)) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok && isCacheable(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const offline = await caches.match('/offline');
    if (offline) return offline;

    return new Response('You are offline and this page has not been saved.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Refuses to cache any response the server marked private.
 *
 * Belt and braces alongside the path exclusions above: if a private response
 * ever reached this point, its own headers would still keep it out of the cache.
 */
function isCacheable(response) {
  if (response.type === 'opaque') return false;
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  if (/(^|,)\s*(private|no-store)/i.test(cacheControl)) return false;
  if (response.headers.has('Set-Cookie')) return false;
  return true;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('network timeout')), ms)),
  ]);
}
