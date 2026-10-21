// Pictures stored inside Firestore (free tier, no extra service). Each photo
// is shrunk to a small JPEG, saved as a base64 data URL in its own document
// in the "images" collection, and the note only holds the short ref
// "fs:<id>". Firestore's persistent cache makes this work offline, and the
// write is queued automatically when there is no network.
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getCached, putCached } from './localBlobStore.js'

export const FS_PREFIX = 'fs:'
export const isFsRef = (s) => typeof s === 'string' && s.startsWith(FS_PREFIX)

export class TooBigForFirestore extends Error {}

// A Firestore document is capped at 1 MiB and base64 adds ~33%, so the JPEG
// itself must stay under ~640 KB.
const MAX_BYTES = 640 * 1024

function toBlob(canvas, quality) {
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
}

async function shrinkToJpeg(file) {
  const type = file.type || ''
  let bmp
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { bmp = null }
  if (!bmp) {
    // Can't decode (odd format): keep as-is only if it already fits.
    if (file.size <= MAX_BYTES) return file
    throw new TooBigForFirestore('Picture is too large to store in Firestore.')
  }
  if ((type === 'image/gif' || type === 'image/svg+xml') && file.size <= MAX_BYTES) { bmp.close?.(); return file }
  let max = 1000
  let quality = 0.8
  for (let i = 0; i < 12; i++) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * k))
    c.height = Math.max(1, Math.round(bmp.height * k))
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await toBlob(c, quality)
    if (blob && blob.size <= MAX_BYTES) { bmp.close?.(); return blob }
    if (quality > 0.45) quality -= 0.1
    else max = Math.round(max * 0.8)
  }
  bmp.close?.()
  throw new TooBigForFirestore('Picture is too large to store in Firestore.')
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl)
  return res.blob()
}

// Saves the picture and returns its "fs:<id>" ref. Works offline: the write
// is queued by Firestore and the on-device copy is available immediately.
export async function saveFsImage(uid, file) {
  const blob = await shrinkToJpeg(file)
  const dataUrl = await blobToDataUrl(blob)
  const ref = doc(db, 'images', crypto.randomUUID())
  const fsRef = FS_PREFIX + ref.id
  await putCached(fsRef, blob)
  const write = setDoc(ref, {
    uid,
    data: dataUrl,
    mime: blob.type || 'image/jpeg',
    createdAt: serverTimestamp(),
  })
  if (navigator.onLine) {
    // Surface real errors (e.g. rules not published) instead of losing the
    // picture silently; if the network is merely slow, let it finish queued.
    await Promise.race([write, new Promise((r) => setTimeout(r, 8000))])
  } else {
    write.catch((e) => console.error('Queued image write failed:', e))
  }
  return fsRef
}

// On-device copy first, then Firestore (which itself reads its offline cache).
export async function getFsImageBlob(fsRef) {
  try {
    const hit = await getCached(fsRef)
    if (hit) return hit
  } catch { /* fall through */ }
  try {
    const snap = await getDoc(doc(db, 'images', fsRef.slice(FS_PREFIX.length)))
    const data = snap.exists() ? snap.data().data : null
    if (!data) return null
    const blob = await dataUrlToBlob(data)
    putCached(fsRef, blob).catch(() => {})
    return blob
  } catch (err) {
    console.warn('Could not load Firestore image', fsRef, err?.code || err)
    return null
  }
}

export function deleteFsImage(fsRef) {
  return deleteDoc(doc(db, 'images', fsRef.slice(FS_PREFIX.length))).catch(() => {})
}

// Bytes for any picture ref: Firestore ref -> stored copy, URL -> fetch.
export async function fetchAttachmentBlob(urlOrRef, init) {
  if (isFsRef(urlOrRef)) {
    const b = await getFsImageBlob(urlOrRef)
    if (!b) throw new Error('image unavailable')
    return b
  }
  const res = await fetch(urlOrRef, init)
  if (!res.ok) throw new Error('bad response')
  return res.blob()
}
