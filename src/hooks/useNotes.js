import { useEffect, useState } from 'react'
import {
  addDoc,
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
import { precacheAttachments } from '../lib/offlinePrecache.js'

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
  const [syncStatus, setSyncStatus] = useState(navigator.onLine ? 'synced' : 'offline')

  useEffect(() => {
    function goOffline() { setSyncStatus('offline') }
    function goOnline() { setSyncStatus((s) => (s === 'offline' ? 'syncing' : s)) }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

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
      const docRef = await addDoc(collection(db, 'notes'), {
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
      })
      return docRef.id
    } catch (err) {
      console.error('createNote failed:', err)
      setError(err.message)
      return null
    }
  }

  async function updateNote(id, patch) {
    try {
      await updateDoc(doc(db, 'notes', id), { ...patch, updatedAt: serverTimestamp() })
    } catch (err) {
      console.error('updateNote failed:', err)
      setError(err.message)
    }
  }

  async function deleteNoteForever(id) {
    try {
      await deleteDoc(doc(db, 'notes', id))
      deleteAllVersions(id) // best-effort, not awaited — subcollection cleanup shouldn't block the delete
    } catch (err) {
      console.error('deleteNoteForever failed:', err)
      setError(err.message)
    }
  }

  async function uploadImage(file) {
    if (!user) return { url: null, error: 'Not signed in' }
    try {
      const path = `notes/${user.uid}/${Date.now()}-${file.name}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      return { url, error: null }
    } catch (err) {
      console.error('uploadImage failed:', err)
      setError(err.message)
      // Returned directly (not just via state) so callers can show the
      // real message immediately instead of racing a state update.
      return { url: null, error: err.code ? `${err.code}: ${err.message}` : err.message }
    }
  }

  return { notes, loading, error, syncStatus, createNote, updateNote, deleteNoteForever, uploadImage }
}
