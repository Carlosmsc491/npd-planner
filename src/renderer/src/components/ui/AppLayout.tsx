import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  MoreHorizontal, ClipboardList, Plane, Umbrella, LayoutGrid, LogOut, Search,
  LayoutDashboard, CheckSquare, Package, Truck, Camera, Users, Calendar,
  Star, Folder, ShoppingCart, FileText, Zap, Globe, Briefcase, Heart, Flag, Coffee, Box, Layers,
  User, Lock, CalendarDays, FlowerIcon, PanelLeftClose, PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'
import { auth } from '../../lib/firebase'
import { useAuthStore } from '../../store/authStore'
import { useBoardStore } from '../../store/boardStore'
import { subscribeToBoards, updateBoard, deleteBoard } from '../../lib/firestore'
import { getBoardColor, getInitials, getInitialsColor } from '../../utils/colorUtils'
import ConnectionStatus from './ConnectionStatus'
import NewBoardModal from './NewBoardModal'
import WhatsNewModal from './WhatsNewModal'
import NotificationBell from '../notifications/NotificationBell'
import { CameraBadge } from './CameraBadge'
import GlobalSearch from '../search/GlobalSearch'
import { useNotifications } from '../../hooks/useNotifications'
import { useClients } from '../../hooks/useClients'
import { useLabels } from '../../hooks/useLabels'
import { subscribeToDateTypes, seedDefaultDateTypes } from '../../lib/firestore'
import { useDateTypeStore } from '../../store/dateTypeStore'
import { getAreaPermission } from '../../hooks/useAreaPermission'
import { usePendingApprovals } from '../../hooks/usePendingApprovals'
import { isPrivileged } from '../../lib/permissions'
import { ApprovalModal } from '../auth/ApprovalModal'
import type { Board, BoardType } from '../../types'

type IconComponent = LucideIcon

const BOARD_ICONS: Record<BoardType, IconComponent> = {
  planner:   ClipboardList,
  trips:     Plane,
  vacations: Umbrella,
  custom:    LayoutGrid,
}

const CUSTOM_BOARD_ICONS: Record<string, IconComponent> = {
  LayoutDashboard, CheckSquare, Plane, Package,
  Truck, Camera, Users, Calendar, Star, Folder, ShoppingCart,
  FileText, Zap, Globe, Briefcase, Heart, Flag, Coffee, Box, Layers,
}

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#EF4444', '#6B7280',
  '#0EA5E9', '#84CC16', '#F43F5E', '#A855F7', '#10B981',
]

const PROTECTED_TYPES = new Set(['planner', 'trips', 'vacations'])

interface AppLayoutProps {
  children: ReactNode
  mainClassName?: string
}

export default function AppLayout({ children, mainClassName = 'flex-1 overflow-auto' }: AppLayoutProps) {
  const { user, setUser } = useAuthStore()
  const { boards, setBoards } = useBoardStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('npd-sidebar') !== 'false' } catch { return true }
  })
  const [menuBoardId, setMenuBoardId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)

  const isAdmin        = user?.role === 'admin' || user?.role === 'owner'
  // Standalone photographer (role=photographer without the add-on flag) is app-restricted
  const isPhotographer = user?.role === 'photographer' && !user?.isPhotographer

  // Pending approvals — only active for admin/owner
  const pendingApprovals = usePendingApprovals(user ?? null)

  // Auto-open approval modal when new users are waiting
  useEffect(() => {
    if (pendingApprovals.length > 0 && user && isPrivileged(user)) {
      setShowApprovalModal(true)
    }
  }, [pendingApprovals.length, user])

  // Always subscribe so labels/clients/dateTypes are available on any page
  useClients()
  useLabels()
  useNotifications()

  // Subscribe to dateTypes when user is authenticated
  useEffect(() => {
    if (!user?.uid) return

    let unsub: (() => void) | undefined
    let mounted = true
    let subscribed = false

    // Small delay to avoid race condition with Firestore initialization
    const timeoutId = setTimeout(() => {
      if (!mounted || !user?.uid || subscribed) return
      subscribed = true

      // Only admins/owners can write — seed only if current user has that role
      if (isAdmin) {
        seedDefaultDateTypes().catch((err) => {
          console.error('Failed to seed default date types:', err)
        })
      }

      try {
        unsub = subscribeToDateTypes((types) => {
          if (mounted) {
            useDateTypeStore.getState().setDateTypes(types)
          }
        })
      } catch (err) {
        console.error('Failed to subscribe to date types:', err)
      }
    }, 100)

    return () => {
      mounted = false
      clearTimeout(timeoutId)
      // Longer delay to avoid Firestore internal error during rapid unmount/remount
      setTimeout(() => {
        if (unsub) {
          try {
            unsub()
          } catch (err) {
            // Ignore errors during unsubscribe
          }
        }
      }, 50)
    }
  }, [user?.uid, isAdmin])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const unsub = subscribeToBoards(setBoards)
    return unsub
  }, [setBoards])

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      try { localStorage.setItem('npd-sidebar', String(!prev)) } catch {}
      return !prev
    })
  }

  async function handleSignOut() {
    await signOut(auth)
    setUser(null)
    navigate('/login')
  }

  function closeMenu() {
    setMenuBoardId(null)
    setMenuPos(null)
  }

  function openEditModal(board: Board) {
    setEditingBoard(board)
    setEditName(board.name)
    setEditColor(getBoardColor(board))
    setEditIcon(board.icon ?? 'LayoutDashboard')
    setConfirmDelete(false)
    closeMenu()
  }

  async function handleEditSave() {
    if (!editingBoard) return
    const updates: Partial<Board> = {}
    const trimmed = editName.trim()
    if (trimmed && trimmed !== editingBoard.name) updates.name = trimmed
    if (editColor !== getBoardColor(editingBoard)) updates.color = editColor
    if (editIcon !== (editingBoard.icon ?? 'LayoutDashboard')) updates.icon = editIcon
    if (Object.keys(updates).length > 0) await updateBoard(editingBoard.id, updates)
    setEditingBoard(null)
  }

  async function handleDeleteConfirmed() {
    if (!editingBoard || PROTECTED_TYPES.has(editingBoard.type)) return
    await deleteBoard(editingBoard.id)
    if (location.pathname === `/board/${editingBoard.id}`) navigate('/dashboard')
    setEditingBoard(null)
  }

  return (
    <div className="flex h-screen w-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-[220px]' : 'w-12'} flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shrink-0 transition-[width] duration-200 overflow-hidden`}>
        {/* Logo */}
        <div className={`flex items-center border-b border-gray-200 dark:border-gray-700 shrink-0 ${sidebarOpen ? 'px-4 py-4 gap-2' : 'px-2 py-4 justify-center'}`}>
          {sidebarOpen && (
            <>
              <div className="h-7 w-7 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-white">N</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white flex-1 whitespace-nowrap">NPD Planner</span>
              <button
                onClick={() => setShowSearch(true)}
                title="Search (Ctrl+K)"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <Search size={14} />
              </button>
            </>
          )}
          <button
            onClick={toggleSidebar}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        </div>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto px-2 py-2 ${sidebarOpen ? '' : 'hidden'}`}>
          {!isPhotographer && [
            { path: '/dashboard',      label: 'Dashboard', icon: LayoutGrid, areaId: 'dashboard' },
            { path: '/my-space',       label: 'My Space', icon: User, isPrivate: true, areaId: 'my_space' },
            { path: '/calendar',       label: 'Master Calendar', icon: CalendarDays, areaId: 'calendar' },
          ].filter((item) => getAreaPermission(item.areaId) !== 'none').map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mb-0.5 transition-colors ${
                  location.pathname === item.path
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {Icon && <Icon size={14} className="shrink-0" />}
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  {item.isPrivate && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                      <Lock size={10} />
                      Private
                    </span>
                  )}
                </div>
              </Link>
            )
          })}

          {/* Boards section — hidden for photographer */}
          {!isPhotographer && (boards.length > 0 || isAdmin) && (
            <>
              <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Boards
              </div>
              {boards.filter((b) => getAreaPermission(`board_${b.id}`) !== 'none').map((board) => {
                const color = getBoardColor(board)
                const isActive = location.pathname === `/board/${board.id}`
                const BoardIcon = (board.type === 'custom' && board.icon && CUSTOM_BOARD_ICONS[board.icon])
                  ? CUSTOM_BOARD_ICONS[board.icon]
                  : BOARD_ICONS[board.type] ?? LayoutGrid

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
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (menuBoardId === board.id) { closeMenu(); return }
                            const rect = e.currentTarget.getBoundingClientRect()
                            setMenuPos({ top: rect.bottom + 4, left: rect.left })
                            setMenuBoardId(board.id)
                          }}
                          className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      )}
                    </Link>
                  </div>
                )
              })}
              {/* New Board button — right after the last board */}
              {isAdmin && (
                <button
                  onClick={() => setShowNewBoard(true)}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:hover:bg-gray-700/50 dark:hover:text-gray-200 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Board
                </button>
              )}
            </>
          )}

          {/* ── NPD Recipes section ──────────────────────────────────── */}
          {getAreaPermission('recipes') !== 'none' && (
            <>
              <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                NPD Recipes
              </div>
              <Link
                to="/recipes"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mb-0.5 transition-colors ${
                  location.pathname.startsWith('/recipes')
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <FlowerIcon size={14} className="shrink-0" />
                <span>NPD Projects</span>
              </Link>
            </>
          )}

          {isAdmin && !isPhotographer && (
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
          )}

          {!isPhotographer && getAreaPermission('analytics') !== 'none' && (
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

        {/* Pending approvals reopen button */}
        {sidebarOpen && user && isPrivileged(user) && pendingApprovals.length > 0 && (
          <div className="px-3 pb-1">
            <button
              onClick={() => setShowApprovalModal(true)}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-900/30 transition-colors"
            >
              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
              {pendingApprovals.length} pending approval{pendingApprovals.length !== 1 ? 's' : ''}
            </button>
          </div>
        )}

        {/* Camera badge (owner + photographer) */}
        {sidebarOpen && (
          <div className="px-3 pb-1">
            <CameraBadge />
          </div>
        )}

        {/* Notifications bell */}
        {sidebarOpen && (
          <div className="px-2 pb-1">
            <NotificationBell />
          </div>
        )}

        {/* User at bottom */}
        {sidebarOpen && user && (
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
      <main className={mainClassName}>
        {children}
      </main>

      <ConnectionStatus />

      {showNewBoard && <NewBoardModal onClose={() => setShowNewBoard(false)} />}
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
      <WhatsNewModal />

      {/* Approval modal — auto-opens for admin/owner when new users register */}
      {showApprovalModal && user && isPrivileged(user) && pendingApprovals.length > 0 && (
        <ApprovalModal
          pending={pendingApprovals}
          currentUser={user}
          boards={boards}
          onClose={() => setShowApprovalModal(false)}
        />
      )}

      {/* Board context menu — rendered via portal to escape sidebar overflow */}
      {menuBoardId && menuPos && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={closeMenu} />
          <div
            className="fixed z-[101] w-36 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {(() => {
              const board = boards.find((b) => b.id === menuBoardId)
              if (!board) return null
              return (
                <button
                  onClick={() => openEditModal(board)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Edit
                </button>
              )
            })()}
          </div>
        </>,
        document.body
      )}

      {/* Edit Board modal */}
      {editingBoard && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => { setEditingBoard(null); setConfirmDelete(false) }} />
          <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-84 max-w-sm rounded-2xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Edit Board</h2>

            {/* Live preview */}
            {(() => {
              const PreviewIcon = (CUSTOM_BOARD_ICONS[editIcon] ?? LayoutGrid) as LucideIcon
              return (
                <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5 mb-4">
                  <PreviewIcon size={18} style={{ color: editColor }} strokeWidth={2} />
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {editName.trim() || 'Board name…'}
                  </span>
                </div>
              )
            })()}

            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') setEditingBoard(null) }}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500 mb-4"
            />

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

            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(CUSTOM_BOARD_ICONS).map(([name, Icon]) => (
                <button
                  key={name}
                  onClick={() => setEditIcon(name)}
                  title={name}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg border-2 transition-colors ${
                    editIcon === name
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <Icon size={15} style={{ color: editColor }} />
                </button>
              ))}
            </div>

            {confirmDelete ? (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-2">Delete "{editingBoard.name}"? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >Keep</button>
                  <button onClick={handleDeleteConfirmed}
                    className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
                  >Delete</button>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2 justify-between">
              {isAdmin && !PROTECTED_TYPES.has(editingBoard.type) ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Delete
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingBoard(null); setConfirmDelete(false) }}
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
          </div>
        </>
      )}
    </div>
  )
}
