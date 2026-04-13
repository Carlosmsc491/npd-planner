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
  persistentMultipleTabManager,
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
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  })
} catch {
  // initializeFirestore throws if the instance was already created (hot reload).
  // Fall back to getFirestore which returns the existing instance.
  db = getFirestore(app)
}

export { db }
export default app
