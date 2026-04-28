import { useState } from 'react'
import { X, Loader2, Shield } from 'lucide-react'
import { updateUserAreaPermissions } from '../../lib/firestore'
import { useTaskStore } from '../../store/taskStore'
import { getBoardColor } from '../../utils/colorUtils'
import type { AppUser, Board, AreaPermission, AreaPermissions } from '../../types'

interface Props {
  targetUser: AppUser
  boards: Board[]
  onClose: () => void
}

interface AreaRow {
  label: string
  areaId: string
  options: AreaPermission[]
}

const CORE_AREAS: AreaRow[] = [
  { label: 'Dashboard',        areaId: 'dashboard',      options: ['none', 'view'] },
  { label: 'My Tasks',         areaId: 'my_tasks',        options: ['none', 'view'] },
  { label: 'My Space',         areaId: 'my_space',        options: ['none', 'view'] },
  { label: 'Master Calendar',  areaId: 'calendar',        options: ['none', 'view'] },
  { label: 'Analytics',        areaId: 'analytics',       options: ['none', 'view'] },
]

const MODULE_AREAS: AreaRow[] = [
  { label: 'NPD Projects',     areaId: 'elitequote',           options: ['none', 'view', 'edit'] },
]

const SETTINGS_TAB_AREAS: AreaRow[] = [
  { label: 'Files (SharePoint)', areaId: 'settings_files',   options: ['none', 'view'] },
  { label: 'Traze / AWB',        areaId: 'settings_traze',   options: ['none', 'view'] },
  { label: 'Trash',              areaId: 'settings_trash',   options: ['none', 'view'] },
  { label: 'Recipe Settings',    areaId: 'settings_recipe',  options: ['none', 'view', 'edit'] },
]

const PERMISSION_LABELS: Record<AreaPermission, string> = {
  none: 'None',
  view: 'View',
  edit: 'Edit',
}

export default function AccessPermissionsModal({ targetUser, boards, onClose }: Props) {
  const { setToast } = useTaskStore()
  const [perms, setPerms] = useState<AreaPermissions>(() => ({ ...targetUser.areaPermissions }))
  const [saving, setSaving] = useState(false)

  const isPrivileged = targetUser.role === 'admin' || targetUser.role === 'owner'

  function setPerm(areaId: string, value: AreaPermission) {
    setPerms((prev) => ({ ...prev, [areaId]: value }))
  }

  function getValue(areaId: string): AreaPermission {
    return perms[areaId] ?? 'none'
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateUserAreaPermissions(targetUser.uid, perms)
      setToast({ id: `access-${targetUser.uid}`, message: `Permissions updated for ${targetUser.name}`, type: 'success', duration: 3000 })
      onClose()
    } catch (err) {
      setToast({ id: `access-err-${targetUser.uid}`, message: `Failed to update permissions: ${err instanceof Error ? err.message : String(err)}`, type: 'error', duration: 5000 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield size={18} className="text-green-500" />
              Access Permissions
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {targetUser.name} · <span className="capitalize">{targetUser.role}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isPrivileged ? (
            <div className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
              <Shield size={20} className="text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                This user has full access based on their <strong>{targetUser.role}</strong> role.
                Area permissions only apply to members.
              </p>
            </div>
          ) : (
            <>
              {/* Core Areas */}
              <SectionLabel label="Core Areas" />
              {CORE_AREAS.map((area) => (
                <PermissionRow
                  key={area.areaId}
                  label={area.label}
                  options={area.options}
                  value={getValue(area.areaId)}
                  onChange={(v) => setPerm(area.areaId, v)}
                />
              ))}

              {/* Boards */}
              <SectionLabel label="Boards" />
              {boards.map((board) => {
                const areaId = `board_${board.id}`
                return (
                  <PermissionRow
                    key={areaId}
                    label={board.name}
                    options={['none', 'view', 'edit']}
                    value={getValue(areaId)}
                    onChange={(v) => setPerm(areaId, v)}
                    dot={getBoardColor(board)}
                  />
                )
              })}

              {/* Modules */}
              <SectionLabel label="Modules" />
              {MODULE_AREAS.map((area) => (
                <PermissionRow
                  key={area.areaId}
                  label={area.label}
                  options={area.options}
                  value={getValue(area.areaId)}
                  onChange={(v) => setPerm(area.areaId, v)}
                />
              ))}

              {/* Settings Tabs */}
              <SectionLabel label="Settings Tabs" />
              {SETTINGS_TAB_AREAS.map((area) => (
                <CheckRow
                  key={area.areaId}
                  label={area.label}
                  enabled={getValue(area.areaId) !== 'none'}
                  onChange={(v) => setPerm(area.areaId, v ? 'view' : 'none')}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        {!isPrivileged && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </span>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function CheckRow({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors ${
          enabled
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
        }`}
      >
        {enabled && (
          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 first:mt-0">
      {label}
    </div>
  )
}

function PermissionRow({
  label,
  options,
  value,
  onChange,
  dot,
}: {
  label: string
  options: AreaPermission[]
  value: AreaPermission
  onChange: (v: AreaPermission) => void
  dot?: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        {dot && (
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        )}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {(['none', 'view', 'edit'] as AreaPermission[]).map((opt) => {
          const available = options.includes(opt)
          if (!available) {
            return (
              <span key={opt} className="flex items-center gap-1 text-xs text-gray-300 dark:text-gray-600 w-14">
                <span className="h-3.5 w-3.5 rounded-full border border-gray-200 dark:border-gray-700" />
                <span className="text-gray-300 dark:text-gray-600">N/A</span>
              </span>
            )
          }
          const selected = value === opt
          return (
            <label key={opt} className="flex items-center gap-1 text-xs cursor-pointer w-14">
              <input
                type="radio"
                name={label}
                checked={selected}
                onChange={() => onChange(opt)}
                className="h-3.5 w-3.5 accent-green-600"
              />
              <span className={selected ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}>
                {PERMISSION_LABELS[opt]}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
