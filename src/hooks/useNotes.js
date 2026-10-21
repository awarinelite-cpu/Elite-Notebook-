import { useEffect, useRef, useState } from 'react'
import {
  setDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { deleteAllVersions } from '../lib/versions.js'
import { getCloudinaryConfig, uploadToCloudinary, RetryLater } from '../lib/cloudinary.js'
import { saveFsImage, deleteFsImage, isFsRef, TooBigForFirestore } from '../lib/fsImages.js'
import { precacheAttachments } from '../lib/offlinePrecache.js'
import { isLocalRef, putPending, getPending, listPending, putCached } from '../lib/localBlobStore.js'

// "local:<id>" refs (files attached while offline) -> uploaded URL, kept so a
// note that still holds the old ref gets rewritten on a later pass.
const MAP_KEY = 'elite-local-ref-map'
const loadMap = () => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}') } catch { return {} } }
const saveMap = (m) => { try { localStorage.setItem(MAP_KEY, JSON.stringify(m)) } catch { /* ignore */ } }
let syncingLocal = false

function refsInNote(note) {
  const out = []
  for (const s of note.images || []) if (isLocalRef(s)) out.push(s)
  for (const s of note.audio || []) if (isLocalRef(s)) out.push(s)
  for (const f of note.files || []) if (isLocalRef(f?.url)) out.push(f.url)
  return out
}

// Pictures go into Firestore (src/lib/fsImages.js); voice memos and documents
// go to Firebase Storage.
async function uploadBlobToStorage(uid, file) {
  if ((file.type || '').startsWith('image/')) {
    // Pictures live in Firestore (works offline, free). Only a picture that
    // cannot be shrunk small enough falls back to Cloudinary / Storage.
    try { return await saveFsImage(uid, file) } catch (err) {
      if (!(err instanceof TooBigForFirestore)) throw err
      if (getCloudinaryConfig()) return uploadToCloudinary(file)
    }
  }
  const storageRef = ref(storage, `notes/${uid}/${Date.now()}-${file.name}`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

// Uploads files that were attached offline and swaps each "local:" ref in
// the notes for the real URL. Safe to call repeatedly.
async function syncLocalRefs(uid, list) {
  if (syncingLocal) return
  syncingLocal = true
  try {
    const map = loadMap()
    const wanted = new Set(list.flatMap(refsInNote))
    if (navigator.onLine) {
      const have = new Set(await listPending())
      for (const r of wanted) {
        if (map[r] || !have.has(r)) continue
        const rec = await getPending(r)
        if (!rec) continue
        try {
          const file = new File([rec.blob], rec.name, { type: rec.type })
          const url = await uploadBlobToStorage(uid, file)
          map[r] = url
          saveMap(map)
          await putCached(url, rec.blob)
        } catch { /* still offline / transient — retry next pass */ }
      }
    }
    const swap = (s) => (isLocalRef(s) && map[s] ? map[s] : s)
    for (const note of list) {
      if (!refsInNote(note).some((r) => map[r])) continue
      const patch = {}
      if ((note.images || []).some((s) => isLocalRef(s) && map[s])) patch.images = note.images.map(swap)
      if ((note.audio || []).some((s) => isLocalRef(s) && map[s])) patch.audio = note.audio.map(swap)
      if ((note.files || []).some((f) => isLocalRef(f?.url) && map[f.url])) {
        patch.files = note.files.map((f) => (f && isLocalRef(f.url) ? { ...f, url: swap(f.url) } : f))
      }
      updateDoc(doc(db, 'notes', note.id), patch).catch(() => {})
    }
  } finally {
    syncingLocal = false
  }
}

function sortNotes(list) {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : Infinity
    const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : Infinity
    return bTime - aTime
  })
}

export function useNotes() {
  const { user } = useAuth()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 'synced' | 'syncing' | 'offline' — derived from the notes listener's
  // snapshot metadata (hasPendingWrites / fromCache) plus the browser's own
  // online/offline events, which fire faster than Firestore notices a
  // dropped connection.
  const notesRef = useRef([])
  const [syncStatus, setSyncStatus] = useState(navigator.onLine ? 'synced' : 'offline')

  useEffect(() => {
    function goOffline() { setSyncStatus('offline') }
    function goOnline() {
      setSyncStatus((s) => (s === 'offline' ? 'syncing' : s))
      if (user && notesRef.current.length) syncLocalRefs(user.uid, notesRef.current)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setNotes([])
      setLoading(false)
      return
    }
    // Deliberately no orderBy here — combining it with the uid filter would
    // require a manually-created Firestore composite index. Sorting happens
    // client-side instead, which works fine at personal-notes scale.
    const q = query(collection(db, 'notes'), where('uid', '==', user.uid))
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const list = sortNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setNotes(list)
        notesRef.current = list
        setLoading(false)
        setError(null)
        if (!navigator.onLine) setSyncStatus('offline')
        else if (snap.metadata.hasPendingWrites) setSyncStatus('syncing')
        else if (snap.metadata.fromCache) setSyncStatus('offline')
        else setSyncStatus('synced')
        // Text/checklist content is already offline-ready via Firestore's
        // own persistent local cache (see firebase.js). This is what makes
        // images/audio/file attachments offline-ready too, instead of only
        // caching each one the first time it's viewed.
        precacheAttachments(list)
        syncLocalRefs(user.uid, list)
      },
      (err) => {
        console.error('Notes listener error:', err)
        setError(err.message)
        setLoading(false)
      }
    )
    return unsub
  }, [user])

  async function createNote(data) {
    if (!user) return null
    try {
      // Client-generated id + un-awaited write: Firestore applies it to the
      // local cache immediately and uploads when the network is back. Awaiting
      // addDoc would hang offline and the editor would never get an id.
      const docRef = doc(collection(db, 'notes'))
      setDoc(docRef, {
        uid: user.uid,
        title: data.title || '',
        text: data.text || '',
        checklist: data.checklist || [],
        images: data.images || [],
        audio: data.audio || [],
        files: data.files || [],
        color: data.color || 'default',
        background: data.background || 'none',
        labels: data.labels || [],
        pinned: data.pinned || false,
        archived: data.archived || false,
        trashed: false,
        reminderAt: data.reminderAt || null,
        keepId: data.keepId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => { console.error('createNote sync failed:', err); setError(err.message) })
      return docRef.id
    } catch (err) {
      console.error('createNote failed:', err)
      setError(err.message)
      return null
    }
  }

  async function updateNote(id, patch) {
    try {
      updateDoc(doc(db, 'notes', id), { ...patch, updatedAt: serverTimestamp() })
        .catch((err) => { console.error('updateNote sync failed:', err); setError(err.message) })
    } catch (err) {
      console.error('updateNote failed:', err)
      setError(err.message)
    }
  }

  async function deleteNoteForever(id) {
    try {
      const gone = notesRef.current.find((n) => n.id === id)
      for (const s of gone?.images || []) if (isFsRef(s)) deleteFsImage(s)
      deleteDoc(doc(db, 'notes', id)).catch((err) => { console.error('deleteNoteForever sync failed:', err) })
      deleteAllVersions(id) // best-effort, not awaited — subcollection cleanup shouldn't block the delete
    } catch (err) {
      console.error('deleteNoteForever failed:', err)
      setError(err.message)
    }
  }

  async function uploadImage(file) {
    if (!user) return { url: null, error: 'Not signed in' }
    try {
      const isImg = (file.type || '').startsWith('image/')
      // Pictures save to Firestore even offline (queued); other files wait locally.
      if (!navigator.onLine && !isImg) return { url: await putPending(file), error: null }
      const url = await uploadBlobToStorage(user.uid, file)
      return { url, error: null }
    } catch (err) {
      console.error('uploadImage failed:', err)
      // Network dropped mid-upload: keep the file on the device and upload later.
      if (!navigator.onLine || err instanceof RetryLater || err.code === 'storage/retry-limit-exceeded' || err.code === 'storage/unknown') {
        try { return { url: await putPending(file), error: null } } catch { /* fall through */ }
      }
      setError(err.message)
      // Returned directly (not just via state) so callers can show the
      // real message immediately instead of racing a state update.
      return { url: null, error: err.code ? `${err.code}: ${err.message}` : err.message }
    }
  }

  return { notes, loading, error, syncStatus, createNote, updateNote, deleteNoteForever, uploadImage }
}
