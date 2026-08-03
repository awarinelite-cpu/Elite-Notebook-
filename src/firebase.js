import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
// This provider is only for the app's own sign-in. Google Drive access is
// requested separately (see src/lib/googleDrive.js) so it never forces a
// Drive consent prompt on ordinary app login, and so Drive can be connected
// to a different Google account than the one signed into the app.

// Persistent local cache (IndexedDB): after the first successful sync,
// notes/labels are read from disk on this device instead of the network.
// Reads resolve instantly and work fully offline; writes made offline are
// queued and pushed once connectivity returns. persistentMultipleTabManager
// lets this stay in sync across multiple open tabs of the app.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const storage = getStorage(app)
export default app
