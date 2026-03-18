/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const offlineFallbackUrl = '/offline.html'
const appShellHandler = createHandlerBoundToURL('/index.html')

registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' && /\/(privacy|terms|offline)\.html$/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'legal-pages',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

registerRoute(
  new NavigationRoute(
    async (options) => {
      try {
        return await appShellHandler(options)
      } catch {
        return (await caches.match(offlineFallbackUrl, { ignoreSearch: true })) ?? Response.error()
      }
    },
    {
      denylist: [/^\/api\//, /\/(privacy|terms|offline)\.html$/],
    },
  ),
)

registerRoute(
  ({ request }) =>
    request.destination === 'script'
    || request.destination === 'style'
    || request.destination === 'worker',
  new StaleWhileRevalidate({
    cacheName: 'static-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'media-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 64,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  }),
)
