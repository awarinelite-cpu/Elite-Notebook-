import { createContext, useContext, useEffect, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider } from '../firebase.js'

const AuthContext = createContext(null)

// Drive access tokens from Firebase's OAuth flow expire after about an hour
// and Firebase does not refresh them for you, so we keep it in memory only
// and let the user "reconnect" (a quick, mostly-invisible popup) whenever a
// Drive API call comes back as unauthorized.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [driveToken, setDriveToken] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  async function login() {
    const result = await signInWithPopup(auth, googleProvider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (credential?.accessToken) setDriveToken(credential.accessToken)
    return result
  }

  // Same as login, but used to silently refresh the Drive token when it
  // expires, without disturbing the rest of the app's auth state.
  async function connectDrive() {
    const result = await signInWithPopup(auth, googleProvider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (credential?.accessToken) setDriveToken(credential.accessToken)
    return credential?.accessToken || null
  }

  function logout() {
    setDriveToken(null)
    return signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, driveToken, connectDrive }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
