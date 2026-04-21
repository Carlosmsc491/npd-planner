// src/renderer/src/components/recipes/RecipeFolderSection.tsx
// Collapsible folder section containing recipe row items

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { RecipeFile } from '../../types'
import RecipeRowItem from './RecipeRowItem'

interface Props {
  folderName: string
  files: RecipeFile[]
  selectedFileId: string | null
  currentUserName: string
  currentUserUid?: string
  selectedFileIds?: Set<string>
  onSelectFile: (file: RecipeFile) => void
  onOpenInExcel: (file: RecipeFile) => void
  onCheckToggle?: (id: string) => void
}

export default function RecipeFolderSection({
  folderName,
  files,
  selectedFileId,
  currentUserName,
  currentUserUid,
  selectedFileIds,
  onSelectFile,
  onOpenInExcel,
  onCheckToggle,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const doneCount = files.filter((f) => f.status === 'done').length
  const total = files.length
  const checkedInFolder = onCheckToggle ? files.filter(f => selectedFileIds?.has(f.id)).length : 0
  const allChecked = onCheckToggle ? checkedInFolder === files.length && files.length > 0 : false

  function toggleSelectAll(e: React.MouseEvent) {
    e.stopPropagation()
    if (!onCheckToggle) return
    if (allChecked) {
      // deselect all in folder
      files.forEach(f => { if (selectedFileIds?.has(f.id)) onCheckToggle(f.id) })
    } else {
      // select all in folder
      files.forEach(f => { if (!selectedFileIds?.has(f.id)) onCheckToggle(f.id) })
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-2">
      {/* Header */}
      <div
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors border-b border-gray-200 dark:border-gray-700"
      >
        <button onClick={() => setCollapsed((v) => !v)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <ChevronRight
            size={14}
            className={`shrink-0 text-gray-400 transition-transform duration-200 ${
              collapsed ? '' : 'rotate-90'
            }`}
          />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-1 truncate">
            📁 {folderName}
          </span>
        </button>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
          {doneCount}/{total} done
        </span>
        {onCheckToggle && (
          <button
            onClick={toggleSelectAll}
            className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded border transition-colors ${
              allChecked
                ? 'border-green-400 text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
                : checkedInFolder > 0
                  ? 'border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'border-gray-200 text-gray-400 dark:border-gray-600 hover:border-gray-400'
            }`}
          >
            {allChecked ? 'Deselect all' : checkedInFolder > 0 ? `${checkedInFolder}/${total}` : 'Select all'}
          </button>
        )}
      </div>

      {/* File list — animated collapse */}
      <div
        className={`transition-all duration-200 overflow-hidden ${
          collapsed ? 'max-h-0' : 'max-h-[9999px]'
        }`}
      >
        {files.length === 0 ? (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 italic">
            No recipes in this folder
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {files.map((file) => (
              <RecipeRowItem
                key={file.id}
                file={file}
                isSelected={selectedFileId === file.id}
                isChecked={selectedFileIds?.has(file.id)}
                currentUserName={currentUserName}
                currentUserUid={currentUserUid}
                onClick={() => onSelectFile(file)}
                onDoubleClick={() => {
                  onSelectFile(file)
                  // Double-click opens Excel only if the current user owns the lock
                  if (
                    file.status === 'in_progress' &&
                    file.lockedBy === currentUserName
                  ) {
                    onOpenInExcel(file)
                  }
                }}
                onCheckToggle={onCheckToggle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
