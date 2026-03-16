import { useEffect, useState, useRef, KeyboardEvent } from 'react'
import { Timestamp } from 'firebase/firestore'
import { subscribeToComments, addComment, subscribeToUsers } from '../../lib/firestore'
import { formatRelativeTime } from '../../utils/dateUtils'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import { useAuthStore } from '../../store/authStore'
import type { Comment, AppUser } from '../../types'

interface Props {
  taskId: string
}

export default function CommentSection({ taskId }: Props) {
  const { user } = useAuthStore()
  const [comments, setComments] = useState<Comment[]>([])
  const [allUsers, setAllUsers] = useState<AppUser[]>([])
  const [text, setText] = useState('')
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const unsub1 = subscribeToComments(taskId, setComments)
    const unsub2 = subscribeToUsers(setAllUsers)
    return () => { unsub1(); unsub2() }
  }, [taskId])

  const filteredUsers = mentionOpen
    ? allUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : []

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)
    const pos = e.target.selectionStart ?? 0
    setCursorPos(pos)

    const before = val.slice(0, pos)
    const atMatch = before.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionOpen(true)
    } else {
      setMentionOpen(false)
    }
  }

  function insertMention(u: AppUser) {
    const before = text.slice(0, cursorPos)
    const after = text.slice(cursorPos)
    const replaced = before.replace(/@\w*$/, `@${u.name} `)
    setText(replaced + after)
    setMentionOpen(false)
    textareaRef.current?.focus()
  }

  function extractMentions(t: string): string[] {
    const names = t.match(/@(\w+ ?\w+)/g)?.map((m) => m.slice(1).trim()) ?? []
    return allUsers.filter((u) => names.includes(u.name)).map((u) => u.uid)
  }

  async function handleSend() {
    if (!text.trim() || !user) return
    await addComment({
      taskId,
      authorId: user.uid,
      authorName: user.name,
      text: text.trim(),
      mentions: extractMentions(text),
      createdAt: Timestamp.now(),
    })
    setText('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
    if (e.key === 'Escape') setMentionOpen(false)
  }

  function renderCommentText(t: string) {
    const parts = t.split(/(@\w+ ?\w+)/g)
    return parts.map((part, i) =>
      part.startsWith('@')
        ? <span key={i} className="font-medium text-green-600 dark:text-green-400">{part}</span>
        : <span key={i}>{part}</span>
    )
  }

  return (
    <div>
      {/* Comments list */}
      <div className="space-y-4 mb-4">
        {comments.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No comments yet.</p>
        )}
        {comments.map((c) => {
          return (
            <div key={c.id} className="flex items-start gap-2.5">
              <div
                className="mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: getInitialsColor(c.authorName) }}
              >
                {getInitials(c.authorName)}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{c.authorName}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatRelativeTime(c.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {renderCommentText(c.text)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Input */}
      <div className="relative">
        {/* Mention dropdown */}
        {mentionOpen && filteredUsers.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 z-20 w-56 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {filteredUsers.map((u) => (
              <button
                key={u.uid}
                onMouseDown={(e) => { e.preventDefault(); insertMention(u) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-xl last:rounded-b-xl"
              >
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: getInitialsColor(u.name) }}
                >
                  {getInitials(u.name)}
                </div>
                <span className="text-gray-700 dark:text-gray-300">{u.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/50">
          {user && (
            <div
              className="mb-1 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: getInitialsColor(user.name) }}
            >
              {getInitials(user.name)}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment… (@ to mention, ⌘Enter to send)"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none dark:text-gray-300 dark:placeholder-gray-500"
            style={{ minHeight: '24px' }}
          />
          {text.trim() && (
            <button
              onClick={handleSend}
              className="shrink-0 rounded-lg bg-green-500 px-3 py-1 text-xs font-semibold text-white hover:bg-green-600 transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
