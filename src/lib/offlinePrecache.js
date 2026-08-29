// Proactively pulls note attachments (images, audio, files) into the same
// 'note-attachments-v3' cache the service worker already serves offline
// requests from (see src/sw.js). Without this, an attachment only gets
// cached the first time some <img>/<audio> tag happens to render it — so a
// note you scrolled past but never opened could still be unreachable
// offline. This walks every synced note and fetches anything missing.
//
// Fetching with { mode: 'cors' } matters: it's what makes the service
// worker's registerRoute for firebasestorage.googleapis.com intercept the
// request and cache a real, readable 200 response (see the crossOrigin fix
// in ImageLightbox.jsx / NoteEditorModal.jsx for why mode consistency
// matters here).

const ATTACHMENT_ORIGIN = 'https://firebasestorage.googleapis.com'
const CONCURRENCY = 3

// Tracks URLs already attempted this session so repeated Firestore snapshot
// updates (which fire on every keystroke's optimistic write) don't re-issue
// a fetch for attachments we've already pulled down.
const attempted = new Set()

function collectAttachmentUrls(notes) {
  const urls = new Set()
  for (const note of notes) {
    for (const field of [note.images, note.audio, note.files]) {
      if (!Array.isArray(field)) continue
      for (const entry of field) {
        const url = typeof entry === 'string' ? entry : null
        if (!url) continue // skip in-flight upload placeholders ({id, previewUrl})
        try {
          if (new URL(url).origin === ATTACHMENT_ORIGIN) urls.add(url)
        } catch {
          // not a real URL — ignore
        }
      }
    }
  }
  return urls
}

async function fetchWithLimit(urls) {
  const queue = [...urls]
  async function worker() {
    while (queue.length) {
      const url = queue.pop()
      attempted.add(url)
      try {
        // 'cors' + 'default' cache mode: let the browser/service worker
        // decide from its own cache before hitting the network.
        await fetch(url, { mode: 'cors', cache: 'default' })
      } catch {
        // Offline, quota exceeded, or a revoked/expired download token —
        // this is best-effort background work, so just drop it. It'll be
        // retried next time notes change (e.g. next app open).
        attempted.delete(url)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

// Call whenever the notes list updates. Safe to call often — it no-ops for
// URLs already attempted or already cached.
export function precacheAttachments(notes) {
  if (!navigator.onLine || !('serviceWorker' in navigator)) return
  if (!Array.isArray(notes) || notes.length === 0) return

  const urls = [...collectAttachmentUrls(notes)].filter((u) => !attempted.has(u))
  if (urls.length === 0) return

  // Don't compete with anything the UI is actively doing (typing, image
  // upload, initial render) — run once the browser is idle, and never block
  // the caller.
  const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000))
  schedule(() => { fetchWithLimit(urls) })
}
