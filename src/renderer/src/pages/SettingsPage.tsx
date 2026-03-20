import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppLayout from '../components/ui/AppLayout'
import MembersPanel from '../components/settings/MembersPanel'
import BoardTemplateEditor from '../components/settings/BoardTemplateEditor'
import SharePointSetup from '../components/settings/SharePointSetup'
import TrazeSettings from '../components/settings/TrazeSettings'
import ClientManager from '../components/settings/ClientManager'
import LabelManager from '../components/settings/LabelManager'
import TrashPanel from '../components/settings/TrashPanel'
import { useAuthStore } from '../store/authStore'
import { useBoardStore } from '../store/boardStore'
import { updateUserName, updateUserPreferences } from '../lib/firestore'
import { getBoardColor } from '../utils/colorUtils'
import type { AppUser, Board, Theme, ShortcutAction } from '../types'
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTION_LABELS } from '../types'

type SettingsTab = 'profile' | 'members' | 'boards' | 'clients' | 'labels' | 'files' | 'appearance' | 'notifications' | 'shortcuts' | 'archive' | 'trash' | 'traze'

const TABS: { id: SettingsTab; label: string; adminOnly?: boolean }[] = [
  { id: 'profile',       label: 'Profile' },
  { id: 'members',       label: 'Members',       adminOnly: true },
  { id: 'boards',        label: 'Boards',         adminOnly: true },
  { id: 'clients',       label: 'Clients',        adminOnly: true },
  { id: 'labels',        label: 'Labels',         adminOnly: true },
  { id: 'files',         label: 'Files' },
  { id: 'traze',         label: 'Traze' },
  { id: 'appearance',    label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'shortcuts',     label: 'Keyboard' },
  { id: 'archive',       label: 'Archive',        adminOnly: true },
  { id: 'trash',         label: 'Trash' },
]

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const { boards, setBoards } = useBoardStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = user?.role === 'admin' || user?.role === 'owner'
  
  // Read tab from query params or default based on role
  const tabFromUrl = searchParams.get('tab') as SettingsTab | null
  const initialTab = tabFromUrl && TABS.some(t => t.id === tabFromUrl && (!t.adminOnly || isAdmin))
    ? tabFromUrl
    : isAdmin ? 'members' : 'profile'
  
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)

  // Update URL when tab changes
  function handleTabChange(tab: SettingsTab) {
    setActiveTab(tab)
    setEditingBoard(null)
    setSearchParams({ tab })
  }

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin)

  function handleBoardUpdate(updated: Board) {
    setEditingBoard(updated)
    setBoards(boards.map((b) => b.id === updated.id ? updated : b))
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'profile' && user && (
          <ProfilePanel
            user={user}
            onNameChange={(name) => { if (user) setUser({ ...user, name }) }}
          />
        )}

        {activeTab === 'members' && isAdmin && <MembersPanel />}

        {activeTab === 'boards' && isAdmin && (
          editingBoard
            ? (
              <BoardTemplateEditor
                board={editingBoard}
                onBack={() => setEditingBoard(null)}
                onBoardUpdate={handleBoardUpdate}
              />
            )
            : <BoardsPanel boards={boards} onEdit={setEditingBoard} />
        )}

        {activeTab === 'clients' && isAdmin && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              Client Management
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Manage clients for your organization. Inactive clients won't appear in dropdowns but their task history is preserved.
            </p>
            <ClientManager />
          </div>
        )}

        {activeTab === 'labels' && isAdmin && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              Label Management
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Create and manage labels to categorize tasks across all boards.
            </p>
            <LabelManager />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="max-w-lg">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              SharePoint File Storage
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Files attached to tasks are copied to your local SharePoint sync folder and
              automatically uploaded to the cloud by OneDrive.
            </p>
            <SharePointSetup />
          </div>
        )}

        {activeTab === 'appearance' && user && (
          <AppearancePanel user={user} onUpdate={(u) => setUser(u)} />
        )}

        {activeTab === 'notifications' && user && (
          <NotificationsPanel user={user} onUpdate={(u) => setUser(u)} />
        )}

        {activeTab === 'shortcuts' && user && (
          <KeyboardShortcutsPanel user={user} onUpdate={(u) => setUser(u)} />
        )}

        {activeTab === 'archive' && isAdmin && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              Archive Old Tasks
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Archive completed tasks older than 12 months to keep your workspace fast and organized.
              Archived tasks are moved to a separate collection and included in annual reports.
            </p>
            <ArchivePanel />
          </div>
        )}

        {activeTab === 'trash' && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              Trash
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Restore deleted tasks or permanently delete them before the automatic cleanup.
            </p>
            <TrashPanel />
          </div>
        )}

        {activeTab === 'traze' && <TrazeSettings />}
      </div>
    </AppLayout>
  )
}

// ─── Boards Panel ──────────────────────────────────────────────────────────

function BoardsPanel({ boards, onEdit }: { boards: Board[]; onEdit: (b: Board) => void }) {
  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Add custom properties to any board. Built-in properties (Client, Date, Status, etc.) are always available.
      </p>
      <div className="space-y-2">
        {boards.map((board) => {
          const color = getBoardColor(board)
          const count = board.customProperties?.length ?? 0
          return (
            <div
              key={board.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{board.name}</p>
                <p className="text-xs text-gray-400">
                  {count} custom propert{count === 1 ? 'y' : 'ies'}
                </p>
              </div>
              <button
                onClick={() => onEdit(board)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Edit Template
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Profile Panel ──────────────────────────────────────────────────────────

function ProfilePanel({
  user,
  onNameChange,
}: {
  user: AppUser
  onNameChange: (name: string) => void
}) {
  const parts = user.name.split(' ')
  const [firstName, setFirstName] = useState(parts[0] ?? '')
  const [lastName, setLastName]   = useState(parts.slice(1).join(' '))
  const [isSaving, setIsSaving]   = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimFirst = firstName.trim()
    const trimLast  = lastName.trim()
    if (!trimFirst) { setError('First name is required.'); return }
    setError('')
    const fullName = trimLast ? `${trimFirst} ${trimLast}` : trimFirst
    setIsSaving(true)
    try {
      await updateUserName(user.uid, fullName)
      onNameChange(fullName)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-sm">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Display Name</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        This name is shown to your teammates across the app.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">Email:</span> {user.email}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Role:</span>{' '}
            <span className={
              user.role === 'owner' ? 'text-amber-600 dark:text-amber-400'
              : user.role === 'admin' ? 'text-purple-600 dark:text-purple-400' : ''
            }>
              {user.role}
            </span>
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/30">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        {saved && (
          <div className="rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/30">
            <p className="text-sm text-green-600 dark:text-green-400">Name updated successfully.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}

// ─── Appearance Panel ───────────────────────────────────────────────────────

function AppearancePanel({ user, onUpdate }: { user: AppUser; onUpdate: (u: AppUser) => void }) {
  const currentTheme: Theme = user.preferences?.theme ?? 'system'
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleTheme(theme: Theme) {
    setSaving(true)
    try {
      await updateUserPreferences(user.uid, { theme })
      onUpdate({ ...user, preferences: { ...user.preferences, theme } })
      // Apply immediately
      if (theme === 'dark') document.documentElement.classList.add('dark')
      else if (theme === 'light') document.documentElement.classList.remove('dark')
      else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.classList.toggle('dark', prefersDark)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const themes: { value: Theme; label: string; desc: string }[] = [
    { value: 'light', label: 'Light', desc: 'Always use light mode' },
    { value: 'dark',  label: 'Dark',  desc: 'Always use dark mode' },
    { value: 'system', label: 'System', desc: 'Follow your OS setting' },
  ]

  return (
    <div className="max-w-sm space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Theme</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Choose how NPD Planner looks on your device.
        </p>
      </div>
      <div className="space-y-2">
        {themes.map((t) => (
          <button
            key={t.value}
            onClick={() => !saving && handleTheme(t.value)}
            disabled={saving}
            className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
              currentTheme === t.value
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
            }`}
          >
            <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
              currentTheme === t.value ? 'border-green-500' : 'border-gray-300 dark:border-gray-600'
            }`}>
              {currentTheme === t.value && (
                <div className="h-2 w-2 rounded-full bg-green-500" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>
      {saved && (
        <p className="text-xs text-green-600 dark:text-green-400">Theme saved.</p>
      )}
    </div>
  )
}

// ─── Keyboard Shortcuts Panel ───────────────────────────────────────────────

function KeyboardShortcutsPanel({ user, onUpdate }: { user: AppUser; onUpdate: (u: AppUser) => void }) {
  const [shortcuts, setShortcuts] = useState<Record<ShortcutAction, string>>({
    ...DEFAULT_SHORTCUTS,
    ...(user.preferences?.shortcuts ?? {}),
  })
  const [editingAction, setEditingAction] = useState<ShortcutAction | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Listen for keypress when editing
  useEffect(() => {
    if (!editingAction) return

    const action = editingAction // capture for type safety

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()

      // Ignore modifier-only keys
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      // Build the shortcut string
      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')
      parts.push(e.key.toLowerCase())

      const newBinding = parts.join('+')

      setShortcuts((prev) => ({ ...prev, [action]: newBinding }))
      setEditingAction(null)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [editingAction])

  async function handleSave() {
    setSaving(true)
    try {
      await updateUserPreferences(user.uid, { shortcuts })
      onUpdate({ ...user, preferences: { ...user.preferences, shortcuts } })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // Error handled silently
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setShortcuts(DEFAULT_SHORTCUTS)
  }

  function formatBinding(binding: string): string {
    return binding
      .replace('ctrl', 'Ctrl')
      .replace('shift', 'Shift')
      .replace('alt', 'Alt')
      .replace('meta', 'Cmd')
      .replace('+', ' + ')
  }

  const actions: ShortcutAction[] = [
    'newTask',
    'editTask',
    'deleteTask',
    'closeModal',
    'globalSearch',
    'toggleDarkMode',
    'goToDashboard',
    'goToCalendar',
    'goToSettings',
  ]

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          Keyboard Shortcuts
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Customize keyboard shortcuts for common actions. Click "Edit" and press your desired key combination.
        </p>
      </div>

      {/* Shortcuts table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {actions.map((action) => (
            <div
              key={action}
              className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {SHORTCUT_ACTION_LABELS[action]}
              </span>
              <div className="flex items-center gap-2">
                {editingAction === action ? (
                  <span className="text-sm font-medium text-green-600 dark:text-green-400 animate-pulse">
                    Press keys...
                  </span>
                ) : (
                  <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-600">
                    {formatBinding(shortcuts[action])}
                  </kbd>
                )}
                <button
                  onClick={() => setEditingAction(action)}
                  disabled={editingAction !== null}
                  className="ml-2 rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {editingAction === action ? '...' : 'Edit'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancel editing button */}
      {editingAction && (
        <button
          onClick={() => setEditingAction(null)}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Cancel editing
        </button>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          Reset to Defaults
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>
        )}
      </div>
    </div>
  )
}

// ─── Notifications Panel ────────────────────────────────────────────────────

function NotificationsPanel({ user, onUpdate }: { user: AppUser; onUpdate: (u: AppUser) => void }) {
  const [dndEnabled, setDndEnabled] = useState(user.preferences?.dndEnabled ?? true)
  const [dndStart, setDndStart] = useState(user.preferences?.dndStart ?? '22:00')
  const [dndEnd, setDndEnd]     = useState(user.preferences?.dndEnd ?? '08:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updateUserPreferences(user.uid, { dndEnabled, dndStart, dndEnd })
      onUpdate({ ...user, preferences: { ...user.preferences, dndEnabled, dndStart, dndEnd } })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-sm space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          Do Not Disturb
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          During these hours, desktop notifications will be silenced (no sound or popup).
          You'll still see them in the notification center.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* DND Toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={dndEnabled}
              onChange={(e) => setDndEnabled(e.target.checked)}
              className="sr-only"
            />
            <div className={`h-6 w-11 rounded-full transition-colors ${dndEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <div className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${dndEnabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
            </div>
          </div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {dndEnabled ? 'DND Enabled' : 'DND Disabled'}
          </span>
        </label>

        {/* Time range (only show if DND enabled) */}
        {dndEnabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start time
                </label>
                <input
                  type="time"
                  value={dndStart}
                  onChange={(e) => setDndStart(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End time
                </label>
                <input
                  type="time"
                  value={dndEnd}
                  onChange={(e) => setDndEnd(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Overnight ranges are supported (e.g., 22:00 → 08:00).
            </p>
          </>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/30">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        {saved && (
          <div className="rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/30">
            <p className="text-sm text-green-600 dark:text-green-400">Settings saved.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}

// ─── Archive Panel ─────────────────────────────────────────────────────────

import { Archive, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { getOldTasksToArchive, archiveOldTasks } from '../lib/firestore'

function ArchivePanel() {
  const [taskCount, setTaskCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [archiving, setArchiving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadTaskCount()
  }, [])

  async function loadTaskCount() {
    setLoading(true)
    try {
      const count = await getOldTasksToArchive()
      setTaskCount(count)
    } catch (err) {
      console.error('Failed to load task count:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleArchive() {
    setArchiving(true)
    setShowConfirm(false)
    try {
      const archived = await archiveOldTasks()
      setResult({
        success: true,
        message: `Successfully archived ${archived} tasks older than 12 months.`,
      })
      // Refresh count
      const newCount = await getOldTasksToArchive()
      setTaskCount(newCount)
    } catch (err) {
      setResult({
        success: false,
        message: 'Failed to archive tasks. Please try again.',
      })
      console.error('Archive failed:', err)
    } finally {
      setArchiving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Status Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/20">
            <Archive className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Tasks Ready for Archive
            </h3>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {taskCount === 0 ? '0' : taskCount?.toLocaleString() ?? '0'}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Completed tasks older than 12 months
            </p>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium">What happens when you archive?</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
              <li>Completed tasks older than 12 months are moved to archive storage</li>
              <li>Tasks are included in annual summary reports</li>
              <li>Active tasks and recent completed tasks are not affected</li>
              <li>This action cannot be undone</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Result Message */}
      {result && (
        <div
          className={`rounded-lg px-4 py-3 ${
            result.success
              ? 'bg-green-50 dark:bg-green-900/20'
              : 'bg-red-50 dark:bg-red-900/20'
          }`}
        >
          <div className="flex items-center gap-2">
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
            <p
              className={`text-sm ${
                result.success
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-red-700 dark:text-red-300'
              }`}
            >
              {result.message}
            </p>
          </div>
        </div>
      )}

      {/* Action Button */}
      {taskCount && taskCount > 0 ? (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={archiving}
          className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {archiving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Archiving...
            </>
          ) : (
            <>
              <Archive className="h-4 w-4" />
              Archive {taskCount} Tasks
            </>
          )}
        </button>
      ) : (
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-center dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No tasks ready for archive. All completed tasks are within the last 12 months.
          </p>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Confirm Archive
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              You are about to archive <strong>{taskCount} tasks</strong> that were completed more than 12 months ago.
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              These tasks will be moved to archive storage and included in annual reports.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
              >
                Yes, Archive Tasks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
