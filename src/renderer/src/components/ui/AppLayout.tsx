import { ReactNode, useEffect } from 'react'
import ConnectionStatus from './ConnectionStatus'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { useAuthStore } from '../../store/authStore'
import { useBoardStore } from '../../store/boardStore'
import { subscribeToBoards } from '../../lib/firestore'
import { BOARD_COLORS, getInitials, getInitialsColor } from '../../utils/colorUtils'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, setUser } = useAuthStore()
  const { boards, setBoards } = useBoardStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const unsub = subscribeToBoards(setBoards)
    return unsub
  }, [setBoards])

  async function handleSignOut() {
    await signOut(auth)
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shrink-0">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">N</span>
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-white">NPD Planner</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {[
            { path: '/dashboard', label: 'Dashboard' },
            { path: '/calendar', label: 'Master Calendar' },
          ].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mb-0.5 transition-colors ${
                location.pathname === item.path
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {item.label}
            </Link>
          ))}

          {/* Boards section */}
          {boards.length > 0 && (
            <>
              <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Boards
              </div>
              {boards.map((board) => {
                const color = BOARD_COLORS[board.type] || board.color || '#888'
                return (
                  <Link
                    key={board.id}
                    to={`/board/${board.id}`}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mb-0.5 transition-colors ${
                      location.pathname === `/board/${board.id}`
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    {board.name}
                  </Link>
                )
              })}
            </>
          )}

          <Link
            to="/settings"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mt-4 transition-colors ${
              location.pathname === '/settings'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            Settings
          </Link>

          {(user?.role === 'admin' || user?.role === 'owner') && (
            <Link
              to="/analytics"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mt-0.5 transition-colors ${
                location.pathname === '/analytics'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              Analytics
            </Link>
          )}
        </nav>

        {/* User at bottom */}
        {user && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3">
            <div className="flex items-center gap-2">
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                style={{ backgroundColor: getInitialsColor(user.name) }}
              >
                {getInitials(user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-gray-900 dark:text-white">{user.name}</p>
                <p className="truncate text-xs text-gray-400">{user.role}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
                title="Sign out"
              >
                ↩
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      <ConnectionStatus />
    </div>
  )
}
