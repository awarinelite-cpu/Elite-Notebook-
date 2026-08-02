// A tiny IndexedDB-backed mailbox for incoming Web Share Target payloads.
// The service worker writes here when Android hands us a shared file (from
// the file manager, Photos, another app, etc.); the app reads it once on
// load and clears it. Plain indexedDB (no library) so this same file can be
// imported from both the page and the service worker.
const DB_NAME = 'elite-notebook-share'
const STORE_NAME = 'pending'
const KEY = 'latest'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// data: { title, text, url, files, ts } — files is an array of Blob/File.
export async function putPendingShare(data) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(data, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Reads and deletes the pending share in one go, so a page refresh doesn't
// re-import the same files twice.
export async function takePendingShare() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getReq = store.get(KEY)
    getReq.onsuccess = () => {
      store.delete(KEY)
      resolve(getReq.result || null)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}
