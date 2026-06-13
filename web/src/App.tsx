import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, doc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/LoginPage'
import BoardsPage from './pages/BoardsPage'
import BoardPage from './pages/BoardPage'
import type { AppUser } from './types'

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="h-10 w-10 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <Spinner />
  if (!user || user.status !== 'active') return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    let unsub: (() => void) | null = null

    const offAuth = onAuthStateChanged(auth, (fbUser) => {
      if (unsub) { unsub(); unsub = null }
      if (!fbUser) { setUser(null); return }

      unsub = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
        if (snap.exists()) setUser(snap.data() as AppUser)
        else setLoading(false)
      })
    })

    return () => { offAuth(); unsub?.() }
  }, [setUser, setLoading])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><BoardsPage /></RequireAuth>} />
      <Route path="/boards" element={<RequireAuth><BoardsPage /></RequireAuth>} />
      <Route path="/board/:boardId" element={<RequireAuth><BoardPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
