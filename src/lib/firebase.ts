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
  getFirestore,
  enableMultiTabIndexedDbPersistence,
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

// Firestore with offline persistence (works without internet)
export const db: Firestore = getFirestore(app)

enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open — only first tab gets persistence
    console.warn('Firestore persistence unavailable: multiple tabs open')
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support IndexedDB
    console.warn('Firestore persistence not supported in this environment')
  }
})

export default app
