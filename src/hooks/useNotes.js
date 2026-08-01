import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase.js'
import { useAuth } from '../context/AuthContext.jsx'

export function useNotes() {
  const { user } = useAuth()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setNotes([])
      setLoading(false)
      return
    }
    const q = query(
      collection(db, 'notes'),
      where('uid', '==', user.uid),
      orderBy('pinned', 'desc'),
      orderBy('updatedAt', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [user])

  async function createNote(data) {
    if (!user) return
    await addDoc(collection(db, 'notes'), {
      uid: user.uid,
      title: data.title || '',
      text: data.text || '',
      checklist: data.checklist || [],
      images: data.images || [],
      color: data.color || 'paper',
      labels: data.labels || [],
      pinned: false,
      archived: false,
      trashed: false,
      reminderAt: data.reminderAt || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async function updateNote(id, patch) {
    await updateDoc(doc(db, 'notes', id), { ...patch, updatedAt: serverTimestamp() })
  }

  async function deleteNoteForever(id) {
    await deleteDoc(doc(db, 'notes', id))
  }

  async function uploadImage(file) {
    if (!user) return null
    const path = `notes/${user.uid}/${Date.now()}-${file.name}`
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file)
    return getDownloadURL(storageRef)
  }

  return { notes, loading, createNote, updateNote, deleteNoteForever, uploadImage }
}
