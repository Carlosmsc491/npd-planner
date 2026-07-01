// src/lib/firebase.ts
// Firebase initialization — reads ALL config from .env
// NEVER hardcode credentials here

import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  Auth
} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  getFirestore,
  Firestore
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Validate all env vars are present at startup
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

for (const key of requiredEnvVars) {
  if (!import.meta.env[key]) {
    throw new Error(
      `Missing environment variable: ${key}. ` +
      `Copy .env.example to .env and fill in your Firebase credentials.`
    )
  }
}

// Initialize Firebase (avoid re-initialization in hot reload)
let app: FirebaseApp
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApps()[0]
}

// Auth with local persistence (stays logged in across app restarts)
export const auth: Auth = getAuth(app)
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Failed to set auth persistence:', err)
})

// Firestore with offline persistence using the Firebase 11 API.
// enableMultiTabIndexedDbPersistence is deprecated and causes
// "INTERNAL ASSERTION FAILED: Unexpected state" errors in Firebase 11.
let db: Firestore
try {
  db = initializeFirestore(app, {
    // SINGLE-tab manager with forced ownership. NPD Planner is a one-window
    // Electron app, so multi-tab coordination has no upside and a real downside:
    // with persistentMultipleTabManager only the "primary" tab can commit writes;
    // if a stale/zombie instance held the primary lease in IndexedDB (seen on Mac),
    // the visible window became a "secondary" and every write hung forever waiting
    // for a primary that no longer exists — while reads still served from cache.
    // forceOwnership makes this window unconditionally own persistence, so writes
    // (create task, approve member, delete, assign…) commit locally and never stall.
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({ forceOwnership: true }),
    }),
    // Electron's WebChannel streaming transport stalls on some networks: the
    // cache served instantly but the first SERVER snapshot took ~3 minutes
    // (measured 185s) while auto-detection failed to kick in. Forcing
    // long-polling makes the live connection establish in seconds.
    experimentalForceLongPolling: true,
  })
} catch {
  // initializeFirestore throws if the instance was already created (hot reload).
  // Fall back to getFirestore which returns the existing instance.
  db = getFirestore(app)
}

export { db }
export default app
