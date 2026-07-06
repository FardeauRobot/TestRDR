/// <reference lib="webworker" />
//
// Custom service worker (vite-plugin-pwa `injectManifest` strategy).
//
// Two jobs:
//  1. Keep the PWA offline-capable — precache the app shell and runtime-cache the
//     external CARTO map tiles (ported from the old generateSW workbox config).
//  2. Receive Web Push messages (e.g. a crewmate's SOS) and raise a system
//     notification so it lands on the lock screen even when the app is closed.
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// This file runs as a service worker, not a DOM window.
declare const self: ServiceWorkerGlobalScope & {
  // Injected at build time by vite-plugin-pwa (the precache manifest).
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

precacheAndRoute(self.__WB_MANIFEST)

// Map tiles are large & external — cache-first, capped, same as before.
registerRoute(
  /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/.*/i,
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 })]
  })
)

// autoUpdate registration expects the new SW to take over promptly.
self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

interface PushPayload {
  title: string
  body: string
  tag?: string
  url?: string
}

// A crewmate sent a push (an SOS broadcast or a "You good?" ping). Show it.
self.addEventListener('push', (event) => {
  let data: PushPayload
  try {
    data = event.data?.json() as PushPayload
  } catch {
    data = { title: 'Crew Watch', body: 'Someone in your crew needs attention.' }
  }
  const { title, body, tag = 'crew', url = '/' } = data
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag, // same tag collapses duplicates rather than stacking
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      requireInteraction: true, // stay on screen until acknowledged
      data: { url }
    })
  )
})

// Tapping the notification focuses an open tab or opens the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
