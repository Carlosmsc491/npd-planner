// src/renderer/src/components/recipes/wizard/WizardStepBasics.tsx
// Step 1: Project name, root folder, template file, creation mode

import { FolderOpen, FileSpreadsheet } from 'lucide-react'

interface BasicsData {
  name: string
  rootPath: string
  templatePath: string
  sourceMode: 'from_scratch' | 'import'
}

interface Props {
  data: BasicsData
  onChange: (updates: Partial<BasicsData>) => void
}

export default function WizardStepBasics({ data, onChange }: Props) {
  async function browseFolder() {
    const selected = await window.electronAPI.selectFolder()
    if (selected) onChange({ rootPath: selected })
  }

  async function browseTemplate() {
    const selected = await window.electronAPI.selectFile()
    if (selected) onChange({ templatePath: selected })
  }

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
              disabled={mode === 'import'}
              className={`rounded-lg border-2 px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                data.sourceMode === mode
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {mode === 'from_scratch' ? 'Create From Scratch' : 'Import From Excel'}
              {mode === 'import' && (
                <span className="block text-[10px] text-gray-400 font-normal mt-0.5">
                  Coming soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Project name */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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
      </div>

      {/* Root folder */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Parent Folder <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 min-w-0">
            <FolderOpen size={14} className="shrink-0 text-gray-400" />
            <span className="text-sm truncate text-gray-600 dark:text-gray-300 font-mono">
              {data.rootPath || <span className="text-gray-400 font-sans">No folder selected</span>}
            </span>
          </div>
          <button
            onClick={browseFolder}
            className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Browse
          </button>
        </div>
      </div>

      {/* Template file */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Master Template (.xlsx) <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 min-w-0">
            <FileSpreadsheet size={14} className="shrink-0 text-gray-400" />
            <span className="text-sm truncate text-gray-600 dark:text-gray-300 font-mono">
              {data.templatePath || <span className="text-gray-400 font-sans">No file selected</span>}
            </span>
          </div>
          <button
            onClick={browseTemplate}
            className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Browse
          </button>
        </div>
      </div>
    </div>
  )
}
