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
  onSelectFile: (file: RecipeFile) => void
  onOpenInExcel: (file: RecipeFile) => void
}

export default function RecipeFolderSection({
  folderName,
  files,
  selectedFileId,
  currentUserName,
  currentUserUid,
  onSelectFile,
  onOpenInExcel,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const doneCount = files.filter((f) => f.status === 'done').length
  const total = files.length

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-2">
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors border-b border-gray-200 dark:border-gray-700 text-left"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${
            collapsed ? '' : 'rotate-90'
          }`}
        />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-1 truncate">
          📁 {folderName}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
          {doneCount}/{total} done
        </span>
      </button>

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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
