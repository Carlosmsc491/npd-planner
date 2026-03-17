// src/renderer/src/components/settings/SharePointSetup.tsx
// SharePoint local sync folder setup — used in Settings > Files tab

import { useState } from 'react'
import { FolderOpen, CheckCircle, AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useSharePoint } from '../../hooks/useSharePoint'

export default function SharePointSetup() {
  const { sharePointPath, isElectron, setupSharePoint, clearPath } = useSharePoint()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  async function handleSetup() {
    setLoading(true)
    setError(null)
    const result = await setupSharePoint()
    setLoading(false)
    if (result.success) {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 3000)
    } else if (result.error) {
      setError(result.error)
    }
  }

  async function handleClear() {
    await clearPath()
    setError(null)
    setJustSaved(false)
  }

  if (!isElectron) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-900/20">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Desktop app required
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
              SharePoint file access is only available in the NPD Planner desktop app.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          SharePoint Sync Folder
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Select your local OneDrive / SharePoint sync folder. It must contain a subfolder named{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] dark:bg-gray-700">
            REPORTS (NPD-SECURE)
          </code>
          .
        </p>
      </div>

      {/* Current path display */}
      {sharePointPath ? (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-700/40 dark:bg-green-900/20">
          <CheckCircle size={16} className="mt-0.5 shrink-0 text-green-500" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400">
              Connected
            </p>
            <p className="mt-0.5 truncate text-xs text-green-600 dark:text-green-500 font-mono">
              {sharePointPath}
            </p>
          </div>
          {justSaved && (
            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-800/40 dark:text-green-400">
              Saved!
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No folder configured. Files cannot be attached to tasks until a folder is selected.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-700/40 dark:bg-red-900/20">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
          <p className="flex-1 text-xs text-red-700 dark:text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSetup}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60 dark:bg-green-700 dark:hover:bg-green-600"
        >
          {loading ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <FolderOpen size={14} />
          )}
          {sharePointPath ? 'Change Folder' : 'Select Folder'}
        </button>

        {sharePointPath && (
          <button
            onClick={handleClear}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Path hint */}
      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        Example path:{' '}
        <span className="font-mono">
          C:\Users\you\OneDrive - Elite Flower
        </span>
      </p>
    </div>
  )
}
