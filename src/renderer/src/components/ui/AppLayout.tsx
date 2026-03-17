import { ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { MoreHorizontal, ClipboardList, Plane, Umbrella, LayoutGrid, LogOut } from 'lucide-react'
import { auth } from '../../lib/firebase'
import { useAuthStore } from '../../store/authStore'
import { useBoardStore } from '../../store/boardStore'
import { subscribeToBoards, updateBoard, deleteBoard } from '../../lib/firestore'
import { BOARD_COLORS, getInitials, getInitialsColor } from '../../utils/colorUtils'
import ConnectionStatus from './ConnectionStatus'
import NewBoardModal from './NewBoardModal'
import NotificationBell from '../notifications/NotificationBell'
import { useNotifications } from '../../hooks/useNotifications'
import { useClients } from '../../hooks/useClients'
import { useLabels } from '../../hooks/useLabels'
import type { Board, BoardType } from '../../types'

const BOARD_ICONS: Record<BoardType, React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
  planner:   ClipboardList,
  trips:     Plane,
  vacations: Umbrella,
  custom:    LayoutGrid,
}

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#EF4444', '#6B7280',
]

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
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [showNewBoard, setShowNewBoard] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  // Always subscribe so labels/clients are available on any page
  useClients()
  useLabels()
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

  function openEditModal(board: Board) {
    setEditingBoard(board)
    setEditName(board.name)
    setEditColor(BOARD_COLORS[board.type] ?? board.color)
    setMenuBoardId(null)
  }

  async function handleEditSave() {
    if (!editingBoard) return
    const updates: Partial<Board> = {}
    const trimmed = editName.trim()
    if (trimmed && trimmed !== editingBoard.name) updates.name = trimmed
    if (editColor !== (BOARD_COLORS[editingBoard.type] ?? editingBoard.color)) updates.color = editColor
    if (Object.keys(updates).length > 0) await updateBoard(editingBoard.id, updates)
    setEditingBoard(null)
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
                const color = BOARD_COLORS[board.type] ?? board.color ?? '#888'
                const isActive = location.pathname === `/board/${board.id}`
                const canDelete = isAdmin && !PROTECTED_TYPES.has(board.type)
                const BoardIcon = BOARD_ICONS[board.type] ?? LayoutGrid

                return (
                  <div key={board.id} className="group relative mb-0.5">
                    <Link
                      to={`/board/${board.id}`}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <BoardIcon size={14} strokeWidth={2} className="shrink-0" style={{ color }} />
                      <span className="flex-1 truncate">{board.name}</span>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuBoardId(menuBoardId === board.id ? null : board.id) }}
                          className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      )}
                    </Link>

                    {/* Board context menu */}
                    {menuBoardId === board.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuBoardId(null)} />
                        <div className="absolute left-full top-0 z-20 ml-1 w-36 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                          <button
                            onClick={() => openEditModal(board)}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            Edit
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => { handleDelete(board); setMenuBoardId(null) }}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              Delete
                            </button>
                          )}
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
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Sign out"
              >
                <LogOut size={14} />
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

      {/* Edit Board modal */}
      {editingBoard && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditingBoard(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-80 rounded-2xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Edit Board</h2>

            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') setEditingBoard(null) }}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500 mb-4"
            />

            {editingBoard.type === 'custom' && (
              <>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Color</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditColor(c)}
                      className={`h-7 w-7 rounded-full transition-transform ${editColor === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingBoard(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white bg-green-500 hover:bg-green-600 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
