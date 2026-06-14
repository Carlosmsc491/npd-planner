import { useState, useEffect } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { updateBoard, updateBoardProperties } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { DynamicIcon, OPTION_COLORS } from '../../utils/propertyUtils'
import { normalizeBoardProperties } from '../../lib/boardProperties'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import RichTextEditor from '../task/RichTextEditor'
import TemplateBuilder from './TemplateBuilder'
import type { AppUser, Board, BoardProperty } from '../../types'

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#EF4444', '#6B7280',
]

interface Props {
  board: Board
  onBack: () => void
  onBoardUpdate: (updated: Board) => void
}

export default function BoardTemplateEditor({ board, onBack, onBoardUpdate }: Props) {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'

  const [properties, setProperties] = useState<BoardProperty[]>(() => normalizeBoardProperties(board))
  const [editingName, setEditingName] = useState(false)
  const [boardNameVal, setBoardNameVal] = useState(board.name)
  const [localBoard, setLocalBoard] = useState(board)

  // Keep local properties in sync with Firestore changes
  useEffect(() => {
    setProperties(normalizeBoardProperties(board))
  }, [board.customProperties, board.type])

  // Persist the normalized (bind-aware) template once on open if it differs
  useEffect(() => {
    const normalized = normalizeBoardProperties(board)
    const existing = board.customProperties ?? []
    if (JSON.stringify(normalized) !== JSON.stringify(existing)) {
      setProperties(normalized)
      updateBoardProperties(board.id, normalized).catch(console.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id])

  function saveProperties(updated: BoardProperty[]) {
    setProperties(updated)
    const updatedBoard = { ...localBoard, customProperties: updated }
    setLocalBoard(updatedBoard)
    onBoardUpdate(updatedBoard)
    updateBoardProperties(localBoard.id, updated).catch(console.error)
  }

  async function saveBoardName() {
    const trimmed = boardNameVal.trim()
    setEditingName(false)
    if (!trimmed || trimmed === localBoard.name) return
    await updateBoard(localBoard.id, { name: trimmed })
    const updated = { ...localBoard, name: trimmed }
    setLocalBoard(updated)
    onBoardUpdate(updated)
  }

  return (
    <div className="h-full overflow-y-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-6 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
      >
        <ArrowLeft size={16} />
        All Boards
      </button>

      {/* Board identity */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 rounded-lg shrink-0" style={{ backgroundColor: localBoard.color }} />
        {editingName ? (
          <input
            autoFocus
            value={boardNameVal}
            onChange={(e) => setBoardNameVal(e.target.value)}
            onBlur={saveBoardName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveBoardName()
              if (e.key === 'Escape') { setBoardNameVal(localBoard.name); setEditingName(false) }
            }}
            className="text-xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-green-500 focus:outline-none"
          />
        ) : (
          <h2
            onClick={() => setEditingName(true)}
            className="text-xl font-bold text-gray-900 dark:text-white cursor-text hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {localBoard.name}
          </h2>
        )}
        {localBoard.type !== 'custom' && (
          <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-400 dark:border-gray-700">
            {localBoard.type}
          </span>
        )}
      </div>

      {/* Color picker — custom boards only */}
      {localBoard.type === 'custom' && (
        <div className="mb-8">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Board Color</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={async () => {
                  await updateBoard(localBoard.id, { color: c })
                  const updated = { ...localBoard, color: c }
                  setLocalBoard(updated)
                  onBoardUpdate(updated)
                }}
                className={`h-7 w-7 rounded-full transition-transform ${localBoard.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}

      {/* The reusable field builder (shared with the New Board wizard) */}
      <TemplateBuilder properties={properties} onChange={saveProperties} isOwner={isOwner} />
    </div>
  )
}

// ─── Exported helper to render a custom field in TaskPage / NewTaskModal ──────

export function CustomFieldInput({
  prop,
  value,
  users,
  onChange,
}: {
  prop: BoardProperty
  value: unknown
  users: AppUser[]
  onChange: (v: unknown) => void
}) {
  let input: React.ReactNode

  switch (prop.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      input = (
        <input
          type={prop.type === 'email' ? 'email' : prop.type === 'url' ? 'url' : prop.type === 'phone' ? 'tel' : 'text'}
          defaultValue={(value as string) ?? ''}
          onBlur={(e) => { if (e.target.value !== ((value as string) ?? '')) onChange(e.target.value) }}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
        />
      )
      break

    case 'number':
      input = (
        <input
          type="number"
          defaultValue={(value as number) ?? ''}
          onBlur={(e) => {
            const n = parseFloat(e.target.value)
            if (!isNaN(n) && n !== (value as number)) onChange(n)
          }}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
        />
      )
      break

    case 'checkbox':
      input = (
        <input
          type="checkbox"
          checked={(value as boolean) ?? false}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-500 cursor-pointer"
        />
      )
      break

    case 'date':
      input = (
        <input
          type="date"
          defaultValue={(value as string) ?? ''}
          onBlur={(e) => { if (e.target.value !== ((value as string) ?? '')) onChange(e.target.value) }}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
        />
      )
      break

    case 'daterange': {
      const dr = (value as { start?: string; end?: string }) ?? {}
      input = (
        <div className="flex items-center gap-2 flex-1">
          <input type="date" defaultValue={dr.start ?? ''}
            onBlur={(e) => onChange({ ...dr, start: e.target.value })}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
          />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" defaultValue={dr.end ?? ''}
            onBlur={(e) => onChange({ ...dr, end: e.target.value })}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
          />
        </div>
      )
      break
    }

    case 'select': {
      const opts = prop.options ?? []
      input = (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
        >
          <option value="">— Select —</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )
      break
    }

    case 'multiselect':
    case 'tags': {
      const opts = prop.options ?? []
      const selected = (value as string[]) ?? []
      const optColor = OPTION_COLORS[0]
      input = (
        <div className="flex flex-wrap gap-1.5 flex-1">
          {opts.map((o) => {
            const active = selected.includes(o.id)
            return (
              <button
                key={o.id}
                onClick={() => onChange(active ? selected.filter((id) => id !== o.id) : [...selected, o.id])}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium border-2 transition-colors"
                style={active
                  ? { backgroundColor: o.color, borderColor: o.color, color: '#fff' }
                  : { borderColor: o.color, color: o.color, backgroundColor: 'transparent' }
                }
              >
                {o.label}
              </button>
            )
          })}
          {opts.length === 0 && <span className="text-xs text-gray-400" style={{ color: optColor }}>No options defined</span>}
        </div>
      )
      break
    }

    case 'person': {
      const selected = (value as string[]) ?? []
      input = (
        <div className="flex flex-wrap gap-1.5">
          {users.map((u) => {
            const active = selected.includes(u.uid)
            return (
              <button
                key={u.uid}
                onClick={() => onChange(active ? selected.filter((id) => id !== u.uid) : [...selected, u.uid])}
                title={u.name}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors border ${
                  active
                    ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:border-green-600'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                <div className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ backgroundColor: getInitialsColor(u.name) }}>
                  {getInitials(u.name)}
                </div>
                {u.name.split(' ')[0]}
              </button>
            )
          })}
        </div>
      )
      break
    }

    case 'richtext':
      input = (
        <RichTextEditor
          content={(value as string) ?? ''}
          onBlur={(html) => onChange(html)}
          onUpdate={(html) => onChange(html)}
        />
      )
      break

    case 'multidate':
      input = <MultiDateField value={(value as MultiDateEntry[]) ?? []} onChange={onChange} />
      break

    case 'followups':
      input = <ChecklistField value={(value as ChecklistEntry[]) ?? []} onChange={onChange} />
      break

    default:
      input = <span className="text-xs text-gray-400">Field type coming soon</span>
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-1.5 w-5 flex items-center justify-center shrink-0">
        <DynamicIcon name={prop.icon} size={14} className="text-gray-400" />
      </span>
      <span className="mt-1.5 w-28 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{prop.name}</span>
      <div className="flex-1">{input}</div>
    </div>
  )
}

// ─── Generic custom-field widgets for the new property types ─────────────────

const MINI_INPUT = 'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs dark:text-white focus:outline-none focus:border-green-500'

interface MultiDateEntry { id: string; label: string; date: string }

function MultiDateField({ value, onChange }: { value: MultiDateEntry[]; onChange: (v: MultiDateEntry[]) => void }) {
  const [label, setLabel] = useState('')
  const [date, setDate]   = useState('')
  function add() {
    if (!date) return
    onChange([...value, { id: crypto.randomUUID(), label: label.trim(), date }])
    setLabel(''); setDate('')
  }
  return (
    <div className="space-y-1.5">
      {value.map((e) => (
        <div key={e.id} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs">
          <span className="flex-1 text-gray-700 dark:text-gray-300">{e.label || 'Date'}</span>
          <span className="text-gray-500">{e.date}</span>
          <button type="button" onClick={() => onChange(value.filter((x) => x.id !== e.id))} className="text-gray-300 hover:text-red-500"><X size={12} /></button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className={`flex-1 ${MINI_INPUT}`} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={MINI_INPUT} />
        <button type="button" onClick={add} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">Add</button>
      </div>
    </div>
  )
}

interface ChecklistEntry { id: string; text: string; done: boolean }

function ChecklistField({ value, onChange }: { value: ChecklistEntry[]; onChange: (v: ChecklistEntry[]) => void }) {
  const [text, setText] = useState('')
  function add() {
    if (!text.trim()) return
    onChange([...value, { id: crypto.randomUUID(), text: text.trim(), done: false }])
    setText('')
  }
  return (
    <div className="space-y-1.5">
      {value.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={e.done} onChange={() => onChange(value.map((x) => x.id === e.id ? { ...x, done: !x.done } : x))} className="rounded" />
          <span className={`flex-1 ${e.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{e.text}</span>
          <button type="button" onClick={() => onChange(value.filter((x) => x.id !== e.id))} className="text-gray-300 hover:text-red-500"><X size={12} /></button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Add item…" className={`flex-1 ${MINI_INPUT}`} />
        <button type="button" onClick={add} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">Add</button>
      </div>
    </div>
  )
}
