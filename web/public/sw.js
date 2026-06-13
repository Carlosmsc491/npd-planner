// Basic service worker — caches shell on install, serves from cache when offline.
const CACHE = 'npd-v1'

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
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Let Firebase/API calls go straight to network
  if (url.hostname.includes('firebase') || url.hostname.includes('google')) return
  // Tailwind CDN — always network (it has its own caching)
  if (url.hostname === 'cdn.tailwindcss.com') return

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request).then((resp) => {
        if (resp.ok && e.request.method === 'GET') {
          const clone = resp.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
        }
        return resp
      })
      return cached ?? networkFetch
    })
  )
})
