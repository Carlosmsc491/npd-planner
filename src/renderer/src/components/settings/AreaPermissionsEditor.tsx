// src/renderer/src/components/settings/AreaPermissionsEditor.tsx
// Inline collapsible permissions editor for a single member user.
// Shown below member rows in MembersPanel.

import { useState, useEffect, useRef } from 'react'
import { updateAreaPermissions } from '../../lib/firestore'
import { canEditAreaPermissions } from '../../lib/permissions'
import { getBoardColor } from '../../utils/colorUtils'
import type { AppUser, Board, AreaPermission, AreaPermissions } from '../../types'

interface Props {
  user: AppUser
  boards: Board[]
  currentUser: AppUser
}

const LEVELS: AreaPermission[] = ['none', 'view', 'edit']

const LEVEL_STYLE: Record<AreaPermission, string> = {
  none: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  view: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  edit: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

const LEVEL_ACTIVE: Record<AreaPermission, string> = {
  none: 'ring-2 ring-gray-400',
  view: 'ring-2 ring-blue-500',
  edit: 'ring-2 ring-green-500',
}

const CORE_ROWS: { label: string; key: string; levels: AreaPermission[] }[] = [
  { label: 'Dashboard',       key: 'dashboard',     levels: ['none', 'view'] },
  { label: 'My Tasks',        key: 'my_tasks',       levels: ['none', 'view'] },
  { label: 'My Space',        key: 'my_space',       levels: ['none', 'view'] },
  { label: 'Master Calendar', key: 'calendar',       levels: ['none', 'view'] },
  { label: 'Analytics',       key: 'analytics',      levels: ['none', 'view'] },
  { label: 'NPD Projects',    key: 'npd_projects',   levels: ['none', 'view', 'edit'] },
]

export function AreaPermissionsEditor({ user, boards, currentUser }: Props) {
  const [perms, setPerms] = useState<AreaPermissions>(() => ({ ...user.areaPermissions }))
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editable = canEditAreaPermissions(currentUser, user)

  // Reset if user prop changes
  useEffect(() => {
    setPerms({ ...user.areaPermissions })
  }, [user.uid, user.areaPermissions])

  if (!editable) return null

  function setLevel(key: string, level: AreaPermission) {
    if (!editable) return
    const next = { ...perms, [key]: level }
    setPerms(next)

    // Debounced save
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateAreaPermissions(user.uid, next).catch(console.error)
    }, 500)
  }

  function getValue(key: string): AreaPermission {
    if (user.role === 'owner' || user.role === 'admin') return 'edit'
    return (perms[key] as AreaPermission) ?? 'none'
  }

  const boardRows = boards.map((b) => ({
    label: b.name,
    key: `board_${b.id}`,
    levels: LEVELS,
    color: getBoardColor(b),
  }))

  const allRows = [
    ...boardRows,
    ...CORE_ROWS.map((r) => ({ ...r, color: undefined })),
  ]

  return (
    <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Area Permissions</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {allRows.map(({ label, key, levels, color }) => {
          const current = getValue(key)
          return (
            <div key={key} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800">
              <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                {color && (
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                )}
                {label}
              </span>
              <div className="flex gap-1">
                {levels.map((lvl) => (
                  <button
                    key={lvl}
                    disabled={!editable}
                    onClick={() => setLevel(key, lvl)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-all ${LEVEL_STYLE[lvl]} ${current === lvl ? LEVEL_ACTIVE[lvl] : 'opacity-50 hover:opacity-75'} disabled:cursor-default`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
