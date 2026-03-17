import { ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { useAuthStore } from '../../store/authStore'
import { useBoardStore } from '../../store/boardStore'
import { subscribeToBoards, updateBoard, deleteBoard } from '../../lib/firestore'
import { BOARD_COLORS, getInitials, getInitialsColor } from '../../utils/colorUtils'
import ConnectionStatus from './ConnectionStatus'
import NewBoardModal from './NewBoardModal'
import NotificationBell from '../notifications/NotificationBell'
import { useNotifications } from '../../hooks/useNotifications'
import type { Board } from '../../types'

const PROTECTED_TYPES = new Set(['planner', 'trips', 'vacations'])

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, setUser } = useAuthStore()
  const { boards, setBoards } = useBoardStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuBoardId, setMenuBoardId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewBoard, setShowNewBoard] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  // Subscribe to notifications + fire desktop alerts
  useNotifications()

  useEffect(() => {
    const unsub = subscribeToBoards(setBoards)
    return unsub
  }, [setBoards])

  async function handleSignOut() {
    await signOut(auth)
    setUser(null)
    navigate('/login')
  }

  async function handleRename(board: Board) {
    const name = renameValue.trim()
    if (name && name !== board.name) await updateBoard(board.id, { name })
    setRenamingId(null)
  }

  async function handleDelete(board: Board) {
    if (PROTECTED_TYPES.has(board.type)) return
    await deleteBoard(board.id)
    if (location.pathname === `/board/${board.id}`) navigate('/dashboard')
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
            { path: '/dashboard',      label: 'Dashboard' },
            { path: '/calendar',       label: 'Master Calendar' },
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
                const isActive = location.pathname === `/board/${board.id}`
                const canManage = isAdmin && !PROTECTED_TYPES.has(board.type)

                return (
                  <div key={board.id} className="group relative mb-0.5">
                    {renamingId === board.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRename(board)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(board)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        className="w-full rounded-lg border border-green-500 bg-white px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-none"
                      />
                    ) : (
                      <Link
                        to={`/board/${board.id}`}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="flex-1 truncate">{board.name}</span>
                        {canManage && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuBoardId(menuBoardId === board.id ? null : board.id) }}
                            className="ml-auto hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                        )}
                      </Link>
                    )}

                    {/* Board context menu */}
                    {menuBoardId === board.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuBoardId(null)} />
                        <div className="absolute left-full top-0 z-20 ml-1 w-36 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                          <button
                            onClick={() => { setRenamingId(board.id); setRenameValue(board.name); setMenuBoardId(null) }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700 first:rounded-t-xl"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => { handleDelete(board); setMenuBoardId(null) }}
                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 last:rounded-b-xl"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* New Board button */}
          {isAdmin && (
            <button
              onClick={() => setShowNewBoard(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:hover:bg-gray-700/50 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Board
            </button>
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

        {/* Notifications bell */}
        <div className="px-2 pb-1">
          <NotificationBell />
        </div>

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

      {showNewBoard && <NewBoardModal onClose={() => setShowNewBoard(false)} />}
    </div>
  )
}
