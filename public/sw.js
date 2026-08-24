/* Recovery worker: replaces and removes the legacy PWA worker. */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key)))
    } catch {}

    try { await self.registration.unregister() } catch {}
    try { await self.clients.claim() } catch {}

    try {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        const url = new URL(client.url)
        if (!url.searchParams.has('__sw_reset')) {
          url.searchParams.set('__sw_reset', String(Date.now()))
          await client.navigate(url.href)
        }
      }
    } catch {}
  })())
})
