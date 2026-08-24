import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { putPendingShare } from './shareTargetDb.js'

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// One-time cleanup: drop the old attachments cache that may hold entries
// cached as "successful" during the Storage billing outage (see sw.js
// note on 'note-attachments-v2' below).
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('note-attachments'))
})

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({ cacheName: 'google-fonts-stylesheets' })
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  })
)

registerRoute(
  ({ url }) => url.origin === 'https://firebasestorage.googleapis.com',
  new CacheFirst({
    // Renamed from 'note-attachments' -> 'note-attachments-v2' to invalidate
    // entries cached while Firebase Storage billing was broken: with no-cors
    // requests every response (success or failure) comes back as an opaque
    // status-0 response, so CacheableResponsePlugin([0,200]) had no way to
    // tell a real image apart from a quota-exceeded failure and cached the
    // failures as if they were good. Bumping the name orphans that bad
    // cache and forces a clean re-fetch for every attachment.
    cacheName: 'note-attachments-v2',
    plugins: [
      // <img>/<audio> requests to a cross-origin URL are made in 'no-cors'
      // mode, so the response comes back opaque (status 0) — accept those
      // alongside normal 200s, or workbox would refuse to cache them at all.
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      // Every upload gets a unique, never-reused storage path (see
      // uploadImage in useNotes.js), so a cached copy is never stale —
      // this just bounds how much disk space old attachments can use.
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true }),
    ],
  })
)

// Web Share Target: the manifest's share_target.action points here. Android
// (and any OS honoring the Web Share Target spec) will POST the shared
// title/text/url/files to this URL when the person picks this app from a
// share sheet. We can't hand files straight to the React app from a service
// worker, so we stash them in IndexedDB and redirect to a URL the app
// recognizes as "come check the mailbox".
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event))
  }
})

// Reminder notifications (see src/lib/notifications.js) are shown via this
// service worker's registration so they still appear when the tab isn't
// focused. Tapping one should jump straight to that note — same pattern as
// the share target above: redirect to a URL the app recognizes, this time
// carrying the note id instead of a mailbox flag.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const noteId = event.notification.data?.noteId
  if (!noteId) return
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = clientsList[0]
      if (existing) {
        existing.postMessage({ type: 'open-note', noteId })
        existing.focus()
      } else {
        self.clients.openWindow(`/?openNote=${encodeURIComponent(noteId)}`)
      }
    })()
  )
})

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData()
    const title = formData.get('title') || ''
    const text = formData.get('text') || ''
    const sharedUrl = formData.get('url') || ''
    const files = formData.getAll('files').filter((f) => f instanceof File && f.size > 0)
    await putPendingShare({ title, text, url: sharedUrl, files, ts: Date.now() })
  } catch (err) {
    console.error('share-target handling failed:', err)
  }
  return Response.redirect('/?shared=1', 303)
}
