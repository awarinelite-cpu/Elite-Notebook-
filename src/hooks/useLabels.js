import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from '../context/AuthContext.jsx'

export function useLabels() {
  const { user } = useAuth()
  const [labels, setLabels] = useState([])

  useEffect(() => {
    if (!user) {
      setLabels([])
      return
    }
    const q = query(collection(db, 'labels'), where('uid', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setLabels(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user])

  async function createLabel(name) {
    if (!user || !name.trim()) return
    await addDoc(collection(db, 'labels'), { uid: user.uid, name: name.trim() })
  }

  async function deleteLabel(id) {
    await deleteDoc(doc(db, 'labels', id))
  }

  return { labels, createLabel, deleteLabel }
}
