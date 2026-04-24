// NotesSection.tsx — Per-recipe notes panel shown in RecipeDetailPanel
// Notes are immutable once posted. Anyone with recipe access can write.
// Only the author or admin/owner can delete.

import { useState, useRef, useEffect } from 'react'
import { StickyNote, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { addRecipeNote, deleteRecipeNote } from '../../lib/recipeFirestore'
import { useRecipeNotes } from '../../hooks/useRecipeNotes'
import type { AppUser } from '../../types'

interface Props {
  projectId: string
  fileId: string
  currentUser: AppUser
}

export default function NotesSection({ projectId, fileId, currentUser }: Props) {
  const { notes, activeNotes, isLoading, error } = useRecipeNotes(projectId, fileId)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  async function handlePost() {
    const trimmed = text.trim()
    if (!trimmed || posting) return
    setPosting(true)
    try {
      await addRecipeNote(projectId, fileId, {
        text: trimmed,
        authorId: currentUser.uid,
        authorName: currentUser.name,
      })
      setText('')
    } finally {
      setPosting(false)
    }
  }

  function canDelete(authorId: string) {
    return (
      currentUser.uid === authorId ||
      currentUser.role === 'owner' ||
      currentUser.role === 'admin'
    )
  }

  async function handleDelete(noteId: string, wasActive: boolean) {
    await deleteRecipeNote(projectId, fileId, noteId, wasActive)
  }

  function formatDate(ts: Timestamp | null): string {
    if (!ts) return ''
    const d = ts.toDate()
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const allResolved = notes.length > 0 && activeNotes.length === 0

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <StickyNote size={13} className="text-gray-400 dark:text-gray-500 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Notes
        </span>
        {activeNotes.length > 0 && (
          <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertTriangle size={9} />
            {activeNotes.length}
          </span>
        )}
        {allResolved && (
          <span className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
            <CheckCircle2 size={11} />
            All addressed
          </span>
        )}
      </div>

      {/* Input */}
      <div className="px-4 space-y-1.5">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost()
          }}
          placeholder="Add a note about this recipe…"
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 transition-shadow"
          style={{ overflow: 'hidden' }}
        />
        <div className="flex justify-end">
          <button
            onClick={handlePost}
            disabled={!text.trim() || posting}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
          >
            {posting ? <Loader2 size={11} className="animate-spin" /> : <StickyNote size={11} />}
            Post Note
          </button>
        </div>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="px-4 py-2">
          <Loader2 size={12} className="animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="px-4 py-2 flex items-center gap-1.5 text-[10px] text-red-500 dark:text-red-400">
          <AlertTriangle size={11} />
          Could not load notes — check Firestore rules are deployed.
        </div>
      ) : notes.length > 0 ? (
        <div className="px-4 mt-2 space-y-2 max-h-52 overflow-y-auto">
          {notes.map((note) => {
            const active = note.resolvedAt === null
            return (
              <div
                key={note.id}
                className={`relative rounded-lg border px-3 py-2 text-xs transition-colors ${
                  active
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/10'
                    : 'border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40 opacity-60'
                }`}
              >
                {/* Author + date */}
                <div className="flex items-center gap-1.5 mb-1">
                  {!active && <CheckCircle2 size={11} className="text-green-500 shrink-0" />}
                  {active && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {note.authorName}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">
                    {formatDate(note.createdAt)}
                  </span>
                  {!active && note.resolvedByName && (
                    <span className="text-green-600 dark:text-green-400 ml-auto text-[10px]">
                      Resolved by {note.resolvedByName}
                    </span>
                  )}
                </div>

                {/* Text */}
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-snug">
                  {note.text}
                </p>

                {/* Delete button */}
                {canDelete(note.authorId) && (
                  <button
                    onClick={() => handleDelete(note.id, active)}
                    className="absolute top-1.5 right-1.5 rounded p-0.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                    title="Delete note"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
