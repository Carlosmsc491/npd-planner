// KILL-SWITCH service worker.
// Previous SW versions cached the app shell and ended up serving stale/broken
// asset combinations (blank screen after a deploy). This SW unregisters itself,
// purges every cache, and reloads open windows once so all clients recover to a
// clean network-only state. main.tsx no longer registers a caching SW.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch { /* ignore */ }
    try {
      await self.registration.unregister()
    } catch { /* ignore */ }
    const clients = await self.clients.matchAll({ type: 'window' })
    clients.forEach((c) => c.navigate(c.url))
  })())
})
