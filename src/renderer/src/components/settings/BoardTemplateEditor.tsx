import { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft, Trash2, GripVertical, Plus, Star, X, Eye, EyeOff,
} from 'lucide-react'
import { updateBoard, updateBoardProperties } from '../../lib/firestore'
import { useTaskStore } from '../../store/taskStore'
import { useAuthStore } from '../../store/authStore'
import { DynamicIcon, PROPERTY_TYPE_LABELS, OPTION_COLORS } from '../../utils/propertyUtils'
import { normalizeBoardProperties, isSystemProperty, PRIORITY_OPTIONS } from '../../lib/boardProperties'
import IconPickerPopover from './IconPickerPopover'
import AddPropertyModal from './AddPropertyModal'
import type { Board, BoardProperty, PropertyType, SelectOption } from '../../types'

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#EF4444', '#6B7280',
]

const PROPERTY_TYPES: PropertyType[] = [
  'text', 'number', 'select', 'multiselect', 'date', 'daterange',
  'person', 'checkbox', 'url', 'attachment', 'tags', 'email', 'phone',
]

// Suggest an icon based on option label/name
function getSuggestedIcon(label: string): string {
  const lower = label.toLowerCase()
  if (lower.includes('high') || lower.includes('urgent') || lower.includes('critical') || lower.includes('important')) return 'AlertCircle'
  if (lower.includes('medium') || lower.includes('normal') || lower.includes('standard')) return 'Minus'
  if (lower.includes('low') || lower.includes('minor') || lower.includes('trivial')) return 'ArrowDown'
  if (lower.includes('block') || lower.includes('stop')) return 'Octagon'
  if (lower.includes('warning') || lower.includes('caution')) return 'AlertTriangle'
  if (lower.includes('info') || lower.includes('note')) return 'Info'
  if (lower.includes('done') || lower.includes('complete') || lower.includes('success')) return 'CheckCircle'
  if (lower.includes('progress') || lower.includes('doing')) return 'Loader'
  if (lower.includes('todo') || lower.includes('pending')) return 'Circle'
  if (lower.includes('review')) return 'Eye'
  return 'CircleDot'
}

// Property templates + normalization now live in lib/boardProperties.ts (single
// source of truth). The editor consumes getDefaultBoardProperties /
// normalizeBoardProperties so settings, the create modal and the task detail all
// agree on the same bind-aware model.

interface Props {
  board: Board
  onBack: () => void
  onBoardUpdate: (updated: Board) => void
}

export default function BoardTemplateEditor({ board, onBack, onBoardUpdate }: Props) {
  const setToast = useTaskStore((s) => s.setToast)
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  // Note: Clients and labels subscriptions removed - they are managed elsewhere
  const [properties, setProperties] = useState<BoardProperty[]>(() => normalizeBoardProperties(board))

  // Sync local properties state when board.customProperties changes from Firestore
  useEffect(() => {
    setProperties(normalizeBoardProperties(board))
  }, [board.customProperties, board.type])
  const [showAddModal, setShowAddModal]       = useState(false)
  const [renamingId, setRenamingId]           = useState<string | null>(null)
  const [renameValue, setRenameValue]         = useState('')
  const [deletingId, setDeletingId]           = useState<string | null>(null)
  const [typePickerId, setTypePickerId]       = useState<string | null>(null)
  const [colorPickerKey, setColorPickerKey]   = useState<string | null>(null) // "propId:optionId" or "icon:propId:optionId"
  const [editingName, setEditingName]         = useState(false)
  const [boardNameVal, setBoardNameVal]       = useState(board.name)
  const [localBoard, setLocalBoard]           = useState(board)
  const dragIndex = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx]         = useState<number | null>(null)

  // On first open, persist the normalized template (adds bind, seeds options,
  // strips foreign builtins, fills defaults) so the rest of the app reads a
  // clean, bind-aware template from Firestore. Idempotent — only writes if it
  // actually differs from what is stored.
  useEffect(() => {
    const normalized = normalizeBoardProperties(board)
    const existing = board.customProperties ?? []
    if (JSON.stringify(normalized) !== JSON.stringify(existing)) {
      setProperties(normalized)
      updateBoardProperties(board.id, normalized).catch(console.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id])

  async function saveProperties(updated: BoardProperty[]) {
    setProperties(updated)
    // Optimistically push to Zustand store so the whole app sees it immediately
    const updatedBoard = { ...localBoard, customProperties: updated }
    setLocalBoard(updatedBoard)
    onBoardUpdate(updatedBoard)
    // Then persist to Firestore in the background
    updateBoardProperties(localBoard.id, updated).catch(console.error)
  }

  async function handleAddProperty(data: Omit<BoardProperty, 'id' | 'order'>) {
    const newProp: BoardProperty = { ...data, id: crypto.randomUUID(), order: properties.length }
    await saveProperties([...properties, newProp])
  }

  async function handleToggleHidden(id: string) {
    await saveProperties(properties.map((p) => p.id === id ? { ...p, hidden: !p.hidden } : p))
  }

  async function handleAddSection() {
    const newSection: BoardProperty = {
      id: `sec_${crypto.randomUUID()}`, name: 'New Section', type: 'section', icon: 'Minus', order: properties.length,
    }
    await saveProperties([...properties, newSection])
  }

  async function handleDelete(id: string) {
    const updated = properties
      .filter((p) => p.id !== id)
      .map((p, i) => ({ ...p, order: i }))
    setDeletingId(null)
    await saveProperties(updated)
  }

  const handleDeleteProperty = (propertyId: string) => {
    const SYSTEM_PROPERTIES = ['builtin-client', 'builtin-status', 'builtin-priority', 'builtin-date', 'builtin-assignees', 'builtin-bucket', 'builtin-awb', 'builtin-po']
    if (SYSTEM_PROPERTIES.includes(propertyId) && !isOwner) {
      setToast({ id: crypto.randomUUID(), type: 'error', message: 'Only owners can delete system properties' })
      return
    }
    setDeletingId(propertyId)
  }

  async function handleRename(id: string) {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (!trimmed) return
    await saveProperties(properties.map((p) => p.id === id ? { ...p, name: trimmed } : p))
  }

  async function handleTypeChange(id: string, newType: PropertyType) {
    setTypePickerId(null)
    await saveProperties(properties.map((p) => p.id === id ? { ...p, type: newType } : p))
  }

  async function handleToggleDisplay(id: string) {
    await saveProperties(properties.map((p) => ({
      ...p,
      display: p.id === id ? !p.display : false,
    })))
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

  // ── Drag & drop ────────────────────────────────────────────
  function handleDragStart(index: number) { dragIndex.current = index }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIdx(index)
  }

  async function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndex.current
    dragIndex.current = null
    setDragOverIdx(null)
    if (from === null || from === index) return
    const reordered = [...properties]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(index, 0, moved)
    await saveProperties(reordered.map((p, i) => ({ ...p, order: i })))
  }

  function handleDragEnd() { dragIndex.current = null; setDragOverIdx(null) }

  return (
    <div className="h-full overflow-y-auto">
      {/* Back */}
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

      {/* ── Form preview — mirrors the actual New Task modal layout ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Fields — drag to reorder
          </h3>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            ⭐ = shown on cards
          </span>
        </div>

        {/* Title is always first and fixed */}
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 opacity-50">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Title <span className="text-red-500">*</span></p>
          <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-400">Task title</div>
        </div>

        {properties.map((prop, i) => {
          // ── Section heading / page break ──
          if (prop.type === 'section') {
            return (
              <div
                key={prop.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                className={`group/prop relative flex items-center gap-2 rounded-lg px-2 pt-5 pb-1 ${dragOverIdx === i ? 'bg-green-50 dark:bg-green-900/10' : ''}`}
              >
                <div className="opacity-0 group-hover/prop:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                  <GripVertical size={14} className="text-gray-300 dark:text-gray-600" />
                </div>
                {renamingId === prop.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(prop.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(prop.id); if (e.key === 'Escape') setRenamingId(null) }}
                    className="rounded border border-green-500 bg-white dark:bg-gray-700 dark:text-white px-2 py-0.5 text-xs font-bold uppercase tracking-wide focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => { setRenamingId(prop.id); setRenameValue(prop.name) }}
                    className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                    title="Click to rename section"
                  >
                    {prop.name}
                  </button>
                )}
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                {deletingId === prop.id ? (
                  <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 rounded px-1.5 py-0.5">
                    <span className="text-[10px] text-red-600 dark:text-red-400">Delete?</span>
                    <button onClick={() => handleDelete(prop.id)} className="text-[10px] font-semibold text-red-600 dark:text-red-400">Yes</button>
                    <button onClick={() => setDeletingId(null)} className="text-[10px] text-gray-400">No</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(prop.id)}
                    className="opacity-0 group-hover/prop:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 dark:text-gray-600 transition-all"
                    title="Delete section"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          }

          // ── System property (Description / Follow-ups / Attachments) ──
          // Reorderable + renamable + hideable, but no type/options (rendered by
          // dedicated components in the task detail).
          if (isSystemProperty(prop.id)) {
            return (
              <div
                key={prop.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                className={`group/prop relative flex items-center gap-2 rounded-xl bg-white dark:bg-gray-800 border px-4 py-3 pl-6 transition-all ${
                  dragOverIdx === i ? 'border-green-500 border-2 shadow-sm' : 'border-gray-200 dark:border-gray-700'
                } ${prop.hidden ? 'opacity-50' : ''}`}
              >
                <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/prop:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                  <GripVertical size={14} className="text-gray-300 dark:text-gray-600" />
                </div>
                {renamingId === prop.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(prop.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(prop.id); if (e.key === 'Escape') setRenamingId(null) }}
                    className="rounded border border-green-500 bg-white dark:bg-gray-700 dark:text-white px-2 py-0.5 text-xs font-medium focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => { setRenamingId(prop.id); setRenameValue(prop.name) }}
                    className="text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                    title="Click to rename"
                  >
                    {prop.name}
                  </button>
                )}
                <span className="text-[10px] text-gray-300 dark:text-gray-600">system</span>
                <div className="flex-1" />
                <button
                  onClick={() => handleToggleHidden(prop.id)}
                  title={prop.hidden ? 'Hidden — click to show' : 'Shown — click to hide'}
                  className={`p-1 rounded transition-colors ${prop.hidden ? 'text-gray-400 hover:text-green-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                >
                  {prop.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            )
          }

          const isOptionType = ['select', 'multiselect', 'tags'].includes(prop.type)
          const isBuiltin = prop.id.startsWith('builtin-')
          const isPriority = prop.id === 'builtin-priority'

          return (
            <div
              key={prop.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
              className={`group/prop relative rounded-xl bg-white dark:bg-gray-800 border transition-all ${
                dragOverIdx === i
                  ? 'border-green-500 border-2 shadow-sm'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Drag handle */}
              <div className="absolute left-1.5 top-3.5 opacity-0 group-hover/prop:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
                <GripVertical size={14} className="text-gray-300 dark:text-gray-600" />
              </div>

              <div className="px-4 pt-3 pb-3 pl-6">
                {/* Label row */}
                <div className="flex items-center gap-2 mb-2">
                  {/* Editable label */}
                  {renamingId === prop.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRename(prop.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(prop.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="rounded border border-green-500 bg-white dark:bg-gray-700 dark:text-white px-2 py-0.5 text-xs font-medium focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => { setRenamingId(prop.id); setRenameValue(prop.name) }}
                      className="text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                      title="Click to rename"
                    >
                      {prop.name}
                      {prop.required && <span className="text-red-500 ml-0.5">*</span>}
                    </button>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Controls — visible on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/prop:opacity-100 transition-opacity">
                    {/* Type picker */}
                    <div className="relative">
                      <button
                        onClick={() => setTypePickerId(typePickerId === prop.id ? null : prop.id)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:text-green-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        {PROPERTY_TYPE_LABELS[prop.type]}
                      </button>
                      {typePickerId === prop.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setTypePickerId(null)} />
                          <div className="absolute right-0 top-full z-[60] mt-1 w-40 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                            {PROPERTY_TYPES.map((t) => (
                              <button key={t} onClick={() => handleTypeChange(prop.id, t)}
                                className={`w-full px-3 py-2 text-left text-xs transition-colors ${prop.type === t ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                              >
                                {PROPERTY_TYPE_LABELS[t]}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Star */}
                    <button
                      onClick={() => handleToggleDisplay(prop.id)}
                      title={prop.display ? 'Shown on task cards' : 'Show on task cards'}
                      className={`p-1 rounded transition-colors ${prop.display ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400 dark:text-gray-600'}`}
                    >
                      <Star size={13} fill={prop.display ? 'currentColor' : 'none'} />
                    </button>

                    {/* Delete */}
                    {deletingId === prop.id ? (
                      <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 rounded px-1.5 py-0.5">
                        <span className="text-[10px] text-red-600 dark:text-red-400">Delete?</span>
                        <button onClick={() => handleDelete(prop.id)} className="text-[10px] font-semibold text-red-600 dark:text-red-400">Yes</button>
                        <button onClick={() => setDeletingId(null)} className="text-[10px] text-gray-400">No</button>
                      </div>
                    ) : (isOwner || !isBuiltin) ? (
                      <button
                        onClick={() => handleDeleteProperty(prop.id)}
                        className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:text-gray-600 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Widget preview — mirrors the actual form input */}
                {isPriority ? (
                  /* Priority: pill buttons like in TaskPage */
                  <div className="flex flex-wrap gap-1.5 pointer-events-none">
                    {(prop.options ?? PRIORITY_OPTIONS).map((opt) => (
                      <span key={opt.id}
                        className="flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-medium"
                        style={{ borderColor: opt.color, color: opt.color }}
                      >
                        <DynamicIcon name={opt.icon ?? getSuggestedIcon(opt.label)} size={11} />
                        {opt.label}
                      </span>
                    ))}
                  </div>
                ) : prop.id === 'builtin-assignees' || prop.type === 'person' ? (
                  /* Person: chips */
                  <div className="flex gap-1.5 pointer-events-none">
                    {['WH', 'EE', 'CS'].map((initials) => (
                      <span key={initials} className="flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-600 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                        <span className="h-4 w-4 rounded-full bg-green-500 flex items-center justify-center text-[8px] font-bold text-white">{initials}</span>
                        {initials === 'WH' ? 'Walter' : initials === 'EE' ? 'Evelyn' : 'Carlos'}
                      </span>
                    ))}
                    <span className="flex items-center gap-1 rounded-full border border-dashed border-gray-200 dark:border-gray-600 px-2 py-0.5 text-xs text-gray-400">
                      <Plus size={10} /> Add
                    </span>
                  </div>
                ) : prop.type === 'daterange' ? (
                  /* Date range: two inputs */
                  <div className="flex items-center gap-2 pointer-events-none">
                    <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-400">MM/DD/YYYY</div>
                    <span className="text-gray-400 text-xs">→</span>
                    <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-400">MM/DD/YYYY</div>
                  </div>
                ) : prop.id === 'builtin-awb' ? (
                  /* Order Status: block label */
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 pointer-events-none">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">P.O. / ORDER # · AWB</p>
                  </div>
                ) : prop.id === 'builtin-po' ? null /* rendered inside Order Status */ : (
                  /* All others: generic input or select preview */
                  isOptionType ? (
                    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-400 flex items-center justify-between pointer-events-none">
                      <span>{prop.options?.[0]?.label ?? '— Select —'}</span>
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  ) : (
                    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-400 pointer-events-none">
                      {prop.type === 'checkbox' ? (
                        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded border-2 border-gray-300 dark:border-gray-500 inline-block" /> {prop.name}</span>
                      ) : prop.type === 'number' ? '0' : prop.name + '...'}
                    </div>
                  )
                )}

                {/* Options editor — for select/multiselect/tags */}
                {isOptionType && !isPriority && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {(prop.options ?? []).map((opt) => {
                      const pickerKey = `${prop.id}:${opt.id}`
                      const iconPickerKey = `icon:${prop.id}:${opt.id}`
                      const isPickerOpen = colorPickerKey === pickerKey
                      const isIconPickerOpen = colorPickerKey === iconPickerKey
                      const iconName = opt.icon || getSuggestedIcon(opt.label)
                      return (
                        <div key={opt.id} className="group/opt relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all"
                          style={{ backgroundColor: prop.type === 'select' ? opt.color : 'transparent', color: prop.type === 'select' ? '#fff' : opt.color, border: `2px solid ${opt.color}` }}
                        >
                          <div className="relative">
                            <button onClick={() => setColorPickerKey(isIconPickerOpen ? null : iconPickerKey)} className="flex items-center justify-center hover:scale-110 transition-transform" title="Change icon">
                              <DynamicIcon name={iconName} size={11} />
                            </button>
                            {isIconPickerOpen && (
                              <div className="absolute left-0 top-full z-[60] mt-1">
                                <IconPickerPopover onSelect={(n) => { saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, icon: n } : o) } : p)); setColorPickerKey(null) }} onClose={() => setColorPickerKey(null)} />
                              </div>
                            )}
                          </div>
                          <input
                            defaultValue={opt.label}
                            onBlur={(e) => { const val = e.target.value.trim(); if (!val || val === opt.label) return; saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, label: val } : o) } : p)) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            className="bg-transparent border-none focus:outline-none focus:ring-0 px-0 py-0 text-xs font-medium"
                            style={{ color: prop.type === 'select' ? '#fff' : opt.color, width: `${opt.label.length + 2}ch`, minWidth: '40px' }}
                          />
                          <div className="relative ml-0.5">
                            <button onClick={() => setColorPickerKey(isPickerOpen ? null : pickerKey)} className="h-2.5 w-2.5 rounded-full border border-white/50 hover:scale-125 transition-transform" style={{ backgroundColor: opt.color }} title="Change color" />
                            {isPickerOpen && (
                              <div className="absolute left-0 top-full z-[60] mt-1">
                                <ColorPickerPopover color={opt.color} onChange={(newColor) => { saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, color: newColor } : o) } : p)) }} onClose={() => setColorPickerKey(null)} />
                              </div>
                            )}
                          </div>
                          <button onClick={() => { saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).filter((o) => o.id !== opt.id) } : p)) }}
                            className="ml-0.5 opacity-0 group-hover/opt:opacity-100 transition-opacity"
                            style={{ color: prop.type === 'select' ? 'rgba(255,255,255,0.7)' : opt.color }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      )
                    })}
                    <button
                      onClick={() => { const newOpt: SelectOption = { id: crypto.randomUUID(), label: 'New', color: OPTION_COLORS[(prop.options ?? []).length % OPTION_COLORS.length], icon: 'Circle' }; saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: [...(p.options ?? []), newOpt] } : p)) }}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-green-600 hover:border-green-300 border-2 border-dashed border-gray-200 dark:border-gray-600 transition-colors"
                    >
                      <Plus size={10} /> Add
                    </button>
                  </div>
                )}

                {/* Priority options editor */}
                {isPriority && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {(prop.options ?? PRIORITY_OPTIONS).map((opt) => {
                      const pickerKey = `${prop.id}:${opt.id}`
                      const isPickerOpen = colorPickerKey === pickerKey
                      return (
                        <div key={opt.id} className="group/opt relative flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-medium"
                          style={{ borderColor: opt.color, color: opt.color }}
                        >
                          <input
                            defaultValue={opt.label}
                            onBlur={(e) => { const val = e.target.value.trim(); if (!val || val === opt.label) return; saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, label: val } : o) } : p)) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            className="bg-transparent border-none focus:outline-none focus:ring-0 px-0 py-0 text-xs font-medium"
                            style={{ color: opt.color, width: `${opt.label.length + 2}ch`, minWidth: '40px' }}
                          />
                          <div className="relative">
                            <button onClick={() => setColorPickerKey(isPickerOpen ? null : pickerKey)} className="h-2.5 w-2.5 rounded-full hover:scale-125 transition-transform" style={{ backgroundColor: opt.color }} />
                            {isPickerOpen && (
                              <div className="absolute left-0 top-full z-[60] mt-1">
                                <ColorPickerPopover color={opt.color} onChange={(newColor) => { saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, color: newColor } : o) } : p)) }} onClose={() => setColorPickerKey(null)} />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Add field / section */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-green-500 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 transition-all hover:bg-green-50 dark:hover:bg-green-900/10"
          >
            <Plus size={16} />
            Add Field
          </button>
          <button
            onClick={handleAddSection}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-green-500 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 transition-all hover:bg-green-50 dark:hover:bg-green-900/10"
            title="Add a section heading / page break"
          >
            <Plus size={16} />
            Add Section
          </button>
        </div>
      </div>

      {showAddModal && (
        <AddPropertyModal onAdd={handleAddProperty} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  )
}

// ─── Color picker popover ───────────────────────────────────────────────────

const COLOR_PICKER_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#1D9E75', '#14B8A6', '#06B6D4',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280',
]

function ColorPickerPopover({ color, onChange, onClose }: {
  color: string
  onChange: (c: string) => void
  onClose: () => void
}) {
  const [hex, setHex] = useState(color)
  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div className="absolute left-0 top-full z-[60] mt-1 w-[168px] rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 p-3">
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {COLOR_PICKER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { onChange(c); setHex(c) }}
              className="h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
              style={{ backgroundColor: c }}
            >
              {color === c && (
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-md shrink-0 border border-gray-200 dark:border-gray-600" style={{ backgroundColor: hex }} />
          <input
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={() => { if (/^#[0-9A-Fa-f]{6}$/.test(hex)) onChange(hex) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && /^#[0-9A-Fa-f]{6}$/.test(hex)) { onChange(hex); onClose() } }}
            maxLength={7}
            className="flex-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-1.5 py-0.5 text-xs font-mono text-gray-700 dark:text-gray-300 focus:outline-none focus:border-green-500"
            placeholder="#000000"
          />
        </div>
      </div>
    </>
  )
}

// ─── Exported helper to render a custom field in TaskPage ───────────────────
// (kept here to co-locate the rendering logic with the editor)

import type { AppUser } from '../../types'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'

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
