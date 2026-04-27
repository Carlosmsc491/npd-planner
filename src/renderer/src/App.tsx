import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './lib/firebase'
import { getUser } from './lib/firestore'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ui/ProtectedRoute'
import { useAreaPermission } from './hooks/useAreaPermission'
import LoginPage from './pages/LoginPage'
import AwaitingApprovalPage from './pages/AwaitingApprovalPage'
import EmergencyPage from './pages/EmergencyPage'
import DashboardPage from './pages/DashboardPage'
import BoardPage from './pages/BoardPage'
import TaskFullPage from './pages/TaskFullPage'
import CalendarPage from './pages/CalendarPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import MyTasksPage from './pages/MyTasksPage'
import MySpacePage from './pages/MySpacePage'
import GlobalSearch from './components/search/GlobalSearch'
import RecipeHomePage from './components/recipes/RecipeHomePage'
import RecipeProjectPage from './components/recipes/RecipeProjectPage'
import NewRecipeProjectWizard from './components/recipes/wizard/NewRecipeProjectWizard'
import CapturePage from './pages/CapturePage'
import { useKeyboardShortcuts, useGlobalSearchState } from './hooks/useKeyboardShortcuts'
import WelcomeWizard from './components/ui/WelcomeWizard'

function BoardRoute() {
  const { boardId } = useParams<{ boardId: string }>()
  const permission = useAreaPermission(`board_${boardId ?? ''}`)
  if (permission === 'none') return <Navigate to="/dashboard" replace />
  return <BoardPage />
}

export default function App() {
  const { setUser, setLoading, user } = useAuthStore()
  const { open: searchOpen, openSearch, closeSearch } = useGlobalSearchState()
  const [updateReady, setUpdateReady] = useState(false)
  const navigate = useNavigate()

  useKeyboardShortcuts(openSearch)

  // Listen for auto-update events from main process
  useEffect(() => {
    const offReady = window.electronAPI.onUpdateDownloaded(() => setUpdateReady(true))
    return () => { offReady() }
  }, [])

  // Listen for desktop notification clicks — navigate to the task
  useEffect(() => {
    const offNotificationClicked = window.electronAPI.onNotificationClicked((taskId: string) => {
      navigate(`/task/${taskId}`)
    })
    return () => { offNotificationClicked() }
  }, [navigate])

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
    <>
    {searchOpen && <GlobalSearch onClose={closeSearch} />}

    {/* Welcome Wizard — shown on first login when SharePoint path not set */}
    {user?.status === 'active' && !user?.preferences?.sharePointPath && (
      <WelcomeWizard user={user} onComplete={() => window.location.reload()} />
    )}

    {/* Update-ready banner — appears when a new version downloaded in background */}
    {updateReady && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1D9E75] text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium">
        <span>New version ready — installs on restart</span>
        <button
          onClick={() => window.electronAPI.send('app:restart-to-update')}
          className="bg-white text-[#1D9E75] px-3 py-1 rounded-lg font-semibold hover:bg-green-50 transition-colors"
        >
          Restart now
        </button>
        <button onClick={() => setUpdateReady(false)} className="opacity-70 hover:opacity-100">✕</button>
      </div>
    )}

    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/awaiting-approval" element={<AwaitingApprovalPage />} />
      <Route path="/emergency" element={<EmergencyPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<ProtectedRoute areaId="dashboard" />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
        <Route element={<ProtectedRoute areaId="my_tasks" />}>
          <Route path="/my-tasks" element={<MyTasksPage />} />
        </Route>
        <Route element={<ProtectedRoute areaId="my_space" />}>
          <Route path="/my-space" element={<MySpacePage />} />
        </Route>
        <Route element={<ProtectedRoute areaId="calendar" />}>
          <Route path="/calendar" element={<CalendarPage />} />
        </Route>
        <Route element={<ProtectedRoute areaId="analytics" />}>
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Route>
        <Route element={<ProtectedRoute areaId="elitequote" />}>
          <Route path="/recipes" element={<RecipeHomePage />} />
          <Route path="/recipes/new" element={<NewRecipeProjectWizard />} />
          <Route path="/recipes/:projectId" element={<RecipeProjectPage />} />
          <Route path="/capture/:recipeId" element={<CapturePage />} />
        </Route>
        <Route path="/board/:boardId" element={<BoardRoute />} />
        <Route path="/task/:taskId" element={<TaskFullPage />} />
        <Route element={<ProtectedRoute requireAdmin />}>
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  )
}
