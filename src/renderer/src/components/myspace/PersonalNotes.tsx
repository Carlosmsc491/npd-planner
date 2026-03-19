import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2 } from 'lucide-react'
import RichTextEditor from '../task/RichTextEditor'

interface Props {
  content: string
  onChange: (content: string) => void
  onSave: () => void
  saving: boolean
  saved: boolean
}

export default function PersonalNotes({ content, onChange, onSave, saving, saved }: Props) {
  const [localContent, setLocalContent] = useState(content)
  const [hasChanges, setHasChanges] = useState(false)

  // Sync local content when prop changes (from external source)
  useEffect(() => {
    setLocalContent(content)
  }, [content])

  // Auto-save after delay when content changes
  useEffect(() => {
    if (!hasChanges) return

    const timer = setTimeout(() => {
      if (localContent !== content) {
        onSave()
        setHasChanges(false)
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [localContent, hasChanges, content, onSave])

  const handleChange = useCallback((newContent: string) => {
    setLocalContent(newContent)
    setHasChanges(true)
    onChange(newContent)
  }, [onChange])

  const getStatusDisplay = () => {
    if (saving) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Loader2 size={12} className="animate-spin" />
          Saving…
        </span>
      )
    }
    if (saved) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <Check size={12} />
          Saved
        </span>
      )
    }
    if (hasChanges) {
      return (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          Unsaved
        </span>
      )
    }
    return null
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Personal Notes
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {getStatusDisplay()}
          <button
            onClick={onSave}
            disabled={saving || !hasChanges}
            className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-4">
        <div className="h-full">
          <RichTextEditor
            content={localContent}
            onBlur={handleChange}
            placeholder="Write your personal notes here…"
          />
        </div>
      </div>
    </div>
  )
}
