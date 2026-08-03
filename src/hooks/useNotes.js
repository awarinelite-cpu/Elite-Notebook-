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
      (snap) => {
        setNotes(sortNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
        setLoading(false)
        setError(null)
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
        pinned: false,
        archived: false,
        trashed: false,
        reminderAt: data.reminderAt || null,
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
    } catch (err) {
      console.error('deleteNoteForever failed:', err)
      setError(err.message)
    }
  }

  async function uploadImage(file) {
    if (!user) return null
    try {
      const path = `notes/${user.uid}/${Date.now()}-${file.name}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file)
      return await getDownloadURL(storageRef)
    } catch (err) {
      console.error('uploadImage failed:', err)
      setError(err.message)
      return null
    }
  }

  return { notes, loading, error, createNote, updateNote, deleteNoteForever, uploadImage }
}
