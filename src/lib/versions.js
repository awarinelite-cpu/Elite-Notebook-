import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase.js'

const RETENTION_MS = 24 * 60 * 60 * 1000 // versions older than this get pruned
const MAX_VERSIONS = 30 // hard cap regardless of age, so one very active note can't grow unbounded

// Only the content a person would actually want to roll back — not
// bookkeeping fields like pinned/archived/labels, which aren't part of
// "what did I just overwrite".
const VERSIONED_FIELDS = ['title', 'text', 'checklist', 'images', 'audio', 'files']

export function snapshotOf(note) {
  const snap = {}
  for (const f of VERSIONED_FIELDS) snap[f] = note[f] ?? (f === 'checklist' || f === 'images' || f === 'audio' || f === 'files' ? [] : '')
  return snap
}

function hasContentChanged(a, b) {
  return VERSIONED_FIELDS.some((f) => JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null))
}

// Saves `previous` (the note's content as it was *before* the edits in this
// session) as a restorable version, then prunes anything past the retention
// window or count cap. Call this once per editing session — not on every
// autosave tick — so a short pause-to-think while typing doesn't generate
// its own version.
export async function saveVersionIfChanged(noteId, previous, current) {
  if (!hasContentChanged(previous, current)) return
  try {
    await addDoc(collection(db, 'notes', noteId, 'versions'), {
      ...snapshotOf(previous),
      savedAt: serverTimestamp(),
    })
    await pruneVersions(noteId)
  } catch (err) {
    // Version history is a nice-to-have safety net, not core functionality —
    // a failure here should never block or interrupt the actual save.
    console.error('saveVersionIfChanged failed:', err)
  }
}

export async function pruneVersions(noteId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'notes', noteId, 'versions'), orderBy('savedAt', 'desc'))
    )
    const cutoff = Date.now() - RETENTION_MS
    const toDelete = snap.docs.filter((d, i) => {
      if (i >= MAX_VERSIONS) return true
      const savedAt = d.data().savedAt?.toMillis?.()
      return savedAt != null && savedAt < cutoff
    })
    await Promise.all(toDelete.map((d) => deleteDoc(d.ref)))
  } catch (err) {
    console.error('pruneVersions failed:', err)
  }
}

export async function listVersions(noteId) {
  const snap = await getDocs(
    query(collection(db, 'notes', noteId, 'versions'), orderBy('savedAt', 'desc'), limit(MAX_VERSIONS))
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Best-effort cleanup when a note is permanently deleted — subcollections
// don't get removed automatically when their parent doc does.
export async function deleteAllVersions(noteId) {
  try {
    const snap = await getDocs(collection(db, 'notes', noteId, 'versions'))
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  } catch (err) {
    console.error('deleteAllVersions failed:', err)
  }
}
