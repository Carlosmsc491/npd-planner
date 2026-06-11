import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, doc } from 'firebase/firestore'
import { auth, db } from './lib/firebase'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ui/ProtectedRoute'
import { useAreaPermission } from './hooks/useAreaPermission'
import LoginPage from './pages/LoginPage'
import AwaitingApprovalPage from './pages/AwaitingApprovalPage'
import EmergencyPage from './pages/EmergencyPage'
import DashboardPage from './pages/DashboardPage'
import BoardPage from './pages/BoardPage'
import TaskFullPage from './pages/TaskFullPage'
import GlobalSearch from './components/search/GlobalSearch'
import { useKeyboardShortcuts, useGlobalSearchState } from './hooks/useKeyboardShortcuts'
import WelcomeWizard from './components/ui/WelcomeWizard'

// Heavy routes load on demand — FullCalendar, Recharts, the recipe module and
// the capture page (camera, sharp previews) stay out of the initial bundle so
// login → dashboard paints faster.
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const MyTasksPage = lazy(() => import('./pages/MyTasksPage'))
const MySpacePage = lazy(() => import('./pages/MySpacePage'))
const RecipeHomePage = lazy(() => import('./components/recipes/RecipeHomePage'))
const RecipeProjectPage = lazy(() => import('./components/recipes/RecipeProjectPage'))
const NewRecipeProjectWizard = lazy(() => import('./components/recipes/wizard/NewRecipeProjectWizard'))
const CapturePage = lazy(() => import('./pages/CapturePage'))

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
    </div>
  )
}

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
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updaterError, setUpdaterError] = useState<string | null>(null)
  const navigate = useNavigate()

  useKeyboardShortcuts(openSearch)

  // Dev-only memory watchdog — logs renderer heap every 20s so OOM growth can
  // be correlated with what the user was doing (remove once the leak is found)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const id = setInterval(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
      if (mem) {
        console.info(`[Mem] used=${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB total=${(mem.totalJSHeapSize / 1048576).toFixed(0)}MB`)
      }
    }, 20_000)
    return () => clearInterval(id)
  }, [])

  // Listen for auto-update events from main process
  useEffect(() => {
    const offAvailable = window.electronAPI.onUpdateAvailable(() => { setUpdateAvailable(true); setUpdaterError(null) })
    const offReady = window.electronAPI.onUpdateDownloaded(() => { setUpdateReady(true); setUpdateAvailable(false) })
    const offError = window.electronAPI.onUpdaterError((msg) => setUpdaterError(msg))
    return () => { offAvailable(); offReady(); offError() }
  }, [])

  // Listen for desktop notification clicks — navigate to the task
  useEffect(() => {
    const offNotificationClicked = window.electronAPI.onNotificationClicked((taskId: string) => {
      navigate(`/task/${taskId}`)
    })
    return () => { offNotificationClicked() }
  }, [navigate])

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null
    const t0 = Date.now()
    let userDocLogged = false

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      console.info(`[Perf] auth state +${Date.now() - t0}ms · user=${firebaseUser ? 'yes' : 'no'}`)
      if (unsubscribeUser) { unsubscribeUser(); unsubscribeUser = null }

      if (firebaseUser) {
        unsubscribeUser = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
          if (!userDocLogged) {
            userDocLogged = true
            console.info(`[Perf] user doc +${Date.now() - t0}ms · exists=${snap.exists()} · fromCache=${snap.metadata.fromCache}`)
          }
          if (snap.exists()) {
            setUser(snap.data() as import('./types').AppUser)
          }
          // If doc doesn't exist yet, LoginPage is mid-registration and will call setUser
          setLoading(false)
        })
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeUser) unsubscribeUser()
    }
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

    {/* Updater error — visible so users can report it */}
    {updaterError && !updateAvailable && !updateReady && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium max-w-lg">
        <span className="truncate">Update check failed: {updaterError}</span>
        <button
          onClick={() => { setUpdaterError(null); window.electronAPI.checkForUpdatesNow() }}
          className="shrink-0 bg-white text-red-600 px-3 py-1 rounded-lg font-semibold hover:bg-red-50 transition-colors"
        >
          Retry
        </button>
        <button onClick={() => setUpdaterError(null)} className="shrink-0 opacity-70 hover:opacity-100">✕</button>
      </div>
    )}

    {/* Update available.
        Windows: it downloads silently in the background.
        Mac: unsigned build — nothing downloads; offer the GitHub release instead. */}
    {updateAvailable && !updateReady && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-blue-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium">
        {window.process?.platform === 'darwin' ? (
          <>
            <span>A new version is available.</span>
            <button
              onClick={() => window.electronAPI.send('app:restart-to-update')}
              className="bg-white text-blue-600 px-3 py-1 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              Download
            </button>
          </>
        ) : (
          <span>A new update is downloading in the background…</span>
        )}
        <button onClick={() => setUpdateAvailable(false)} className="opacity-70 hover:opacity-100">✕</button>
      </div>
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

    <Suspense fallback={<RouteFallback />}>
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
        <Route element={<ProtectedRoute areaId="npd_projects" />}>
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
    </Suspense>
    </>
  )
}
