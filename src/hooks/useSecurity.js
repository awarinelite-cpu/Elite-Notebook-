import { useEffect, useState, useCallback } from 'react'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  isBiometricAvailable,
  isBiometricEnrolled,
  enrollBiometric as webauthnEnroll,
  verifyBiometric as webauthnVerify,
  disableBiometric as webauthnDisable,
} from '../utils/biometricAuth.js'

// PINs are never stored or transmitted in plain text — only a SHA-256 hash
// ever reaches Firestore, computed locally with the Web Crypto API.
async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function unlockKey(uid) {
  return `elite-notebook-unlocked-${uid}`
}

// Manages the app-lock PIN. The unlock state lives in sessionStorage so the
// lock re-engages whenever the app/tab is fully closed and reopened, but
// doesn't re-prompt on every re-render or navigation within one session.
export function useSecurity() {
  const { user } = useAuth()
  const [pinHash, setPinHash] = useState(undefined) // undefined = loading, null = no PIN set
  const [unlocked, setUnlocked] = useState(false)
  const [biometricSupported, setBiometricSupported] = useState(false)
  const [biometricEnrolled, setBiometricEnrolled] = useState(false)

  useEffect(() => {
    isBiometricAvailable().then(setBiometricSupported)
  }, [])

  useEffect(() => {
    if (!user) {
      setPinHash(undefined)
      setUnlocked(false)
      setBiometricEnrolled(false)
      return
    }
    setUnlocked(sessionStorage.getItem(unlockKey(user.uid)) === '1')
    setBiometricEnrolled(isBiometricEnrolled(user.uid))
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(db, 'userSecurity', user.uid))
      if (cancelled) return
      setPinHash(snap.exists() ? snap.data().pinHash : null)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const unlock = useCallback(() => {
    if (!user) return
    sessionStorage.setItem(unlockKey(user.uid), '1')
    setUnlocked(true)
  }, [user])

  const lock = useCallback(() => {
    if (!user) return
    sessionStorage.removeItem(unlockKey(user.uid))
    setUnlocked(false)
  }, [user])

  const setPin = useCallback(
    async (pin) => {
      if (!user) return
      const h = await hashPin(pin)
      await setDoc(doc(db, 'userSecurity', user.uid), { pinHash: h, updatedAt: Date.now() })
      setPinHash(h)
      unlock()
    },
    [user, unlock]
  )

  const removePin = useCallback(async () => {
    if (!user) return
    await deleteDoc(doc(db, 'userSecurity', user.uid))
    setPinHash(null)
  }, [user])

  const verifyPin = useCallback(
    async (pin) => {
      const h = await hashPin(pin)
      if (h === pinHash) {
        unlock()
        return true
      }
      return false
    },
    [pinHash, unlock]
  )

  // Fingerprint unlock is only offered once a PIN already exists — it's a
  // faster alternative to typing the PIN each time, not a replacement for
  // it, so "Use PIN instead" always still works as a fallback.
  const enableBiometric = useCallback(async () => {
    if (!user) return
    await webauthnEnroll({ id: user.uid, displayName: user.displayName || user.email })
    setBiometricEnrolled(true)
  }, [user])

  const disableBiometricUnlock = useCallback(() => {
    if (!user) return
    webauthnDisable(user.uid)
    setBiometricEnrolled(false)
  }, [user])

  const unlockWithBiometric = useCallback(async () => {
    if (!user) return false
    const ok = await webauthnVerify(user.uid)
    if (ok) unlock()
    return ok
  }, [user, unlock])

  return {
    loading: pinHash === undefined,
    hasPin: !!pinHash,
    unlocked,
    setPin,
    removePin,
    verifyPin,
    lock,
    biometricSupported,
    biometricEnrolled,
    enableBiometric,
    disableBiometric: disableBiometricUnlock,
    unlockWithBiometric,
  }
}
