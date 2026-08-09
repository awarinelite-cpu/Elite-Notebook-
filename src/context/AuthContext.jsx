import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase.js'

const AuthContext = createContext(null)

// This only handles the main app account (Firebase Auth). Google Drive has
// its own, separate connection — see useDriveAuth.js — so that signing out
// of Drive never signs the person out of the app, and vice versa.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  function login() {
    return signInWithPopup(auth, googleProvider)
  }

  function loginWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password)
  }

  function signupWithEmail(email, password) {
    return createUserWithEmailAndPassword(auth, email, password)
  }

  function resetPassword(email) {
    return sendPasswordResetEmail(auth, email)
  }

  function logout() {
    return signOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginWithEmail, signupWithEmail, resetPassword, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
