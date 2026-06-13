// Service worker — network-first for app shell/code, cache fallback when offline.
// Bump CACHE on every deploy that must invalidate old assets.
const CACHE = 'npd-v3'

const SHELL = [
  '/npd-planner/',
  '/npd-planner/index.html',
  '/npd-planner/manifest.json',
  '/npd-planner/icons/icon-192.png',
  '/npd-planner/icons/icon-512.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Firebase/Google APIs and Tailwind CDN always go straight to network.
  if (url.hostname.includes('firebase') || url.hostname.includes('google')) return
  if (url.hostname === 'cdn.tailwindcss.com') return
  if (e.request.method !== 'GET') return

  const isNavigation = e.request.mode === 'navigate'
  const isAppCode = url.pathname.endsWith('.html') ||
                    url.pathname.endsWith('.js') ||
                    url.pathname.endsWith('.css') ||
                    url.pathname.endsWith('/')

  // Network-first for navigations and app code so a new deploy shows immediately.
  if (isNavigation || isAppCode) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone()
            caches.open(CACHE).then((c) => c.put(e.request, clone))
          }
          return resp
        })
        .catch(() => caches.match(e.request).then((c) => c ?? caches.match('/npd-planner/index.html')))
    )
    return
  }

  // Cache-first for everything else (images, icons — immutable assets).
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
        }
        return resp
      })
      return cached ?? networkFetch
    })
  )
})
