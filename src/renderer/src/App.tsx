import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './lib/firebase'
import { getUser } from './lib/firestore'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ui/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import AwaitingApprovalPage from './pages/AwaitingApprovalPage'
import EmergencyPage from './pages/EmergencyPage'
import DashboardPage from './pages/DashboardPage'
import BoardPage from './pages/BoardPage'
import TaskFullPage from './pages/TaskFullPage'
import CalendarPage from './pages/CalendarPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const { setUser, setLoading, user } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const appUser = await getUser(firebaseUser.uid)
        // Only update store if we got a doc — if null, LoginPage is mid-registration
        // and will call setUser itself after creating the doc
        if (appUser !== null) setUser(appUser)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [setUser, setLoading])

  // Apply theme based on user preferences
  useEffect(() => {
    const theme = user?.preferences?.theme ?? 'system'
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', prefersDark)
    }
  }, [user?.preferences?.theme])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/awaiting-approval" element={<AwaitingApprovalPage />} />
      <Route path="/emergency" element={<EmergencyPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/board/:boardId" element={<BoardPage />} />
        <Route path="/task/:taskId" element={<TaskFullPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
