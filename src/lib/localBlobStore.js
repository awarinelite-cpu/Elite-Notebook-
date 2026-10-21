// Permanent on-device storage for note attachments (images, audio, files),
// so they open with no network — the same idea as Google Keep keeping its
// own copy of everything.
//
// Two IndexedDB object stores:
//   cache   : remote download URL -> Blob   (copy of an already-uploaded file)
//   pending : id -> { blob, name, type }    (file attached while offline,
//                                            waiting to upload; referenced in
//                                            the note as "local:<id>")
// Unlike the service-worker Cache Storage this has no entry cap and no expiry.

const DB_NAME = 'elite-notebook-blobs'
const DB_VERSION = 1
let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache')
      if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(store, mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export const LOCAL_PREFIX = 'local:'
export const isLocalRef = (s) => typeof s === 'string' && s.startsWith(LOCAL_PREFIX)

export const getCached = (url) => tx('cache', 'readonly', (s) => s.get(url))
export const putCached = (url, blob) => tx('cache', 'readwrite', (s) => s.put(blob, url))
export const hasCached = async (url) => (await tx('cache', 'readonly', (s) => s.count(url))) > 0

export async function putPending(file) {
  const id = crypto.randomUUID()
  await tx('pending', 'readwrite', (s) =>
    s.put({ blob: file, name: file.name || 'file', type: file.type || '' }, id))
  return LOCAL_PREFIX + id
}
export const getPending = (ref) => tx('pending', 'readonly', (s) => s.get(ref.slice(LOCAL_PREFIX.length)))
export const deletePending = (ref) => tx('pending', 'readwrite', (s) => s.delete(ref.slice(LOCAL_PREFIX.length)))
export const listPending = () => tx('pending', 'readonly', (s) => s.getAllKeys())
  .then((keys) => (keys || []).map((k) => LOCAL_PREFIX + k))

// Ask the browser not to evict this origin's storage under disk pressure.
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch { /* best effort */ }
}
