import { useEffect, useRef } from 'react'

// Firestore sync gives us metadata (URLs) instantly from the local cache,
// but the actual image/audio bytes behind those URLs still only get cached
// lazily, the first time each one is actually viewed (see the
// firebasestorage.googleapis.com route in sw.js). This walks every note's
// attachments right after they load and quietly requests each one so the
// service worker caches it up front — matching Keep's "sync everything on
// login, use it offline forever after" behavior instead of "cache only
// what you happened to open."
const CONCURRENCY = 3
const BATCH_PAUSE_MS = 150

function collectAttachmentUrls(notes) {
  const urls = new Set()
  for (const note of notes) {
    for (const src of note.images || []) {
      if (typeof src === 'string') urls.add(src)
    }
    for (const src of note.audio || []) {
      if (typeof src === 'string') urls.add(src)
    }
    for (const file of note.files || []) {
      if (file?.url) urls.add(file.url)
    }
  }
  return urls
}

export function usePrefetchAttachments(notes) {
  const doneRef = useRef(new Set()) // URLs already prefetched (or attempted) this session
  const runningRef = useRef(false)

  useEffect(() => {
    if (!notes?.length) return
    if (!('serviceWorker' in navigator)) return
    // Respect data saver mode — don't burn someone's data plan pulling
    // down every note image in the background without being asked.
    if (navigator.connection?.saveData) return

    const urls = collectAttachmentUrls(notes)
    const pending = [...urls].filter((u) => !doneRef.current.has(u))
    if (!pending.length || runningRef.current) return

    let cancelled = false
    runningRef.current = true

    ;(async () => {
      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        if (cancelled || !navigator.onLine) break
        const batch = pending.slice(i, i + CONCURRENCY)
        await Promise.all(
          batch.map(async (url) => {
            doneRef.current.add(url)
            try {
              // no-cors matches how <img>/<audio> tags request these files
              // and produces the same opaque response the CacheFirst route
              // is already set up to accept.
              await fetch(url, { mode: 'no-cors', credentials: 'omit' })
            } catch {
              // Offline or blocked mid-prefetch — harmless, it'll just get
              // cached the normal lazy way whenever it's actually opened.
              doneRef.current.delete(url)
            }
          })
        )
        if (i + CONCURRENCY < pending.length) {
          await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS))
        }
      }
      runningRef.current = false
    })()

    return () => {
      cancelled = true
    }
  }, [notes])
}
