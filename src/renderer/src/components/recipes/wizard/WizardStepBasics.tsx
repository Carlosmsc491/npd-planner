// src/renderer/src/components/recipes/wizard/WizardStepBasics.tsx
// Step 1: Project name, root folder, template file, creation mode

import { useEffect, useState } from 'react'
import { FolderOpen, FileSpreadsheet, Package, AlertTriangle, Download, Upload, Loader2, CheckCircle2 } from 'lucide-react'

export interface ImportRow { name: string; price: string; option: string; pickNeeded: string }

const DEFAULT_TEMPLATE_NAME = 'ELITE QUOTE BOUQUET 2026'

interface BasicsData {
  name: string
  rootPath: string
  templatePath: string
  sourceMode: 'from_scratch' | 'import'
  dueDate: string | null
  useProjectNameForSpec: boolean   // true = E4 gets project name; false = use specSheetName
  specSheetName: string            // custom Spec Sheet E4 value when useProjectNameForSpec=false
}

interface Props {
  data: BasicsData
  onChange: (updates: Partial<BasicsData>) => void
  onImportRows?: (rows: ImportRow[]) => void
}

export default function WizardStepBasics({ data, onChange, onImportRows }: Props) {
  const [loadingTemplate, setLoadingTemplate] = useState(false)

  // ── Import from Excel state ────────────────────────────────────────────────
  const [importBusy, setImportBusy] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importCount, setImportCount] = useState<number | null>(null)

  async function handleDownloadTemplate() {
    setImportBusy(true)
    const res = await window.electronAPI.recipeCreateImportTemplate()
    setImportBusy(false)
    setImportErrors(res.error ? [res.error] : [])
  }

  async function handleLoadFile() {
    setImportBusy(true)
    setImportErrors([])
    setImportCount(null)
    const res = await window.electronAPI.recipeParseImportExcel()
    setImportBusy(false)
    if (res.errors.length > 0) { setImportErrors(res.errors); return }
    if (res.rows.length === 0) return   // cancelled or empty file
    setImportCount(res.rows.length)
    onImportRows?.(res.rows)
  }

  // Keep rootPath in sync with npd:projects_root from localStorage
  const projectsRoot = localStorage.getItem('npd:projects_root') ?? ''
  useEffect(() => {
    if (projectsRoot && !data.rootPath) {
      onChange({ rootPath: projectsRoot })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Preview: show rootPath / sanitized(name)
  const folderName = data.name.trim().replace(/[<>:"/\\|?*]/g, '').trim() || 'Project Name'
  const previewRoot = data.rootPath || projectsRoot

  // Auto-fill default template on first render if none is set
  useEffect(() => {
    if (data.templatePath) return
    if (typeof window.electronAPI?.getDefaultTemplatePath !== 'function') return
    setLoadingTemplate(true)
    const timer = setTimeout(() => setLoadingTemplate(false), 8_000) // fallback — never show forever
    window.electronAPI.getDefaultTemplatePath().then((p) => {
      onChange({ templatePath: p })
    }).catch(() => {
      // IPC failed — user will need to select the template manually via Browse
    }).finally(() => {
      clearTimeout(timer)
      setLoadingTemplate(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function browseTemplate() {
    const selected = await window.electronAPI.selectFile()
    if (selected) onChange({ templatePath: selected })
  }

  const isDefaultTemplate = data.templatePath?.endsWith(`${DEFAULT_TEMPLATE_NAME}.xlsx`)
  const templateLabel = isDefaultTemplate
    ? DEFAULT_TEMPLATE_NAME
    : (data.templatePath?.split(/[\\/]/).pop() ?? '')

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Creation Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['from_scratch', 'import'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChange({ sourceMode: mode })}
              className={`rounded-lg border-2 px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                data.sourceMode === mode
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              {mode === 'from_scratch' ? 'Create From Scratch' : 'Import From Excel'}
              {mode === 'import' && (
                <span className="block text-[10px] text-gray-400 dark:text-gray-500 font-normal mt-0.5">
                  Load recipes from a spreadsheet
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Import from Excel panel */}
      {data.sourceMode === 'import' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-2.5">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Fill in the template — columns <span className="font-semibold">Name · Price · Option · Required Pick</span>.
            Option and Required Pick are droplists. The app validates every row before creating anything
            (numbers only in Price, a letter in Option, Y/N in Required Pick) and normalizes text to UPPERCASE.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadTemplate}
              disabled={importBusy}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <Download size={13} /> Download template
            </button>
            <button
              onClick={handleLoadFile}
              disabled={importBusy}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {importBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Load filled file
            </button>
          </div>
          {importCount !== null && importErrors.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
              <CheckCircle2 size={13} /> {importCount} recipe{importCount !== 1 ? 's' : ''} imported — review them in step 3.
            </p>
          )}
          {importErrors.length > 0 && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 max-h-40 overflow-y-auto">
              <p className="flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                <AlertTriangle size={12} /> Fix these and load again — nothing was imported:
              </p>
              <ul className="text-[11px] text-red-600 dark:text-red-400 space-y-0.5 list-disc pl-4">
                {importErrors.slice(0, 40).map((e, i) => <li key={i}>{e}</li>)}
                {importErrors.length > 40 && <li>…and {importErrors.length - 40} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Project name */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          Project Name <span className="text-red-500">*</span>
        </label>
        <input
          autoFocus
          type="text"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Valentine's Day 2026"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
        />

        {/* Spec Sheet E4 name option */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={data.useProjectNameForSpec}
            onChange={(e) => onChange({ useProjectNameForSpec: e.target.checked, specSheetName: '' })}
            className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-green-500 focus:ring-green-500"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Use same project name in Spec Sheet (cell E4)
          </span>
        </label>

        {!data.useProjectNameForSpec && (
          <input
            type="text"
            value={data.specSheetName}
            onChange={(e) => onChange({ specSheetName: e.target.value })}
            placeholder="Spec Sheet name for E4…"
            className="w-full rounded-lg border border-green-400 dark:border-green-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
          />
        )}
      </div>

      {/* Project location — read-only, computed from projectsRoot + name */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Project will be created at
        </label>
        {previewRoot ? (
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 min-w-0">
            <FolderOpen size={14} className="shrink-0 mt-0.5 text-green-500" />
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all leading-relaxed">
              {previewRoot}
              <span className="text-green-600 dark:text-green-400 font-semibold">/{folderName}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={13} className="shrink-0" />
            No projects root configured. Go back to NPD Projects and select your projects folder first.
          </div>
        )}
      </div>

      {/* Template file */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Master Template (.xlsx) <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 min-w-0">
            <FileSpreadsheet size={14} className="shrink-0 text-green-500" />
            {data.templatePath ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate text-gray-700 dark:text-gray-200 font-medium">
                  {templateLabel}
                </span>
                {isDefaultTemplate && (
                  <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 text-[9px] font-semibold text-green-700 dark:text-green-400">
                    <Package size={8} />
                    Default
                  </span>
                )}
              </div>
            ) : loadingTemplate ? (
              <span className="text-sm text-gray-400 font-sans animate-pulse">Loading default template…</span>
            ) : (
              <span className="text-sm text-amber-500 font-sans">No template selected — click Browse</span>
            )}
          </div>
          <button
            onClick={browseTemplate}
            className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Browse
          </button>
        </div>
        {isDefaultTemplate && (
          <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
            Bundled with the app — use Browse to override with a custom template.
          </p>
        )}
      </div>

      {/* Project deadline */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Project deadline (optional)
        </label>
        <input
          type="date"
          value={data.dueDate ?? ''}
          onChange={e => onChange({ dueDate: e.target.value || null })}
          min={new Date().toISOString().split('T')[0]}
          className="w-full px-3 py-2 text-sm rounded-lg border
                    border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800
                    text-gray-900 dark:text-white
                    focus:outline-none focus:border-green-500"
        />
        <p className="text-xs text-gray-400">
          Date of the show or client delivery
        </p>
      </div>
    </div>
  )
}
