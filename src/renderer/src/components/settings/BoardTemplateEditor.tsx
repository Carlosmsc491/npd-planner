import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Trash2, GripVertical, Plus, Settings, X, Star } from 'lucide-react'
import { updateBoard, updateBoardProperties, subscribeToClients } from '../../lib/firestore'
import { DynamicIcon, PROPERTY_TYPE_LABELS, OPTION_COLORS } from '../../utils/propertyUtils'
import { BOARD_BUCKETS } from '../../utils/colorUtils'
import IconPickerPopover from './IconPickerPopover'
import AddPropertyModal from './AddPropertyModal'
import type { Board, BoardProperty, PropertyType, SelectOption, Client } from '../../types'

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#EF4444', '#6B7280',
]

const PROPERTY_TYPES: PropertyType[] = [
  'text', 'number', 'select', 'multiselect', 'date', 'daterange',
  'person', 'checkbox', 'url', 'attachment', 'tags', 'email', 'phone',
]

const STATUS_OPTIONS: SelectOption[] = [
  { id: 'status-todo',       label: 'To Do',       color: '#9CA3AF' },
  { id: 'status-inprogress', label: 'In Progress', color: '#F59E0B' },
  { id: 'status-review',     label: 'Review',      color: '#378ADD' },
  { id: 'status-done',       label: 'Done',        color: '#1D9E75' },
]

const PRIORITY_OPTIONS: SelectOption[] = [
  { id: 'priority-normal', label: 'Normal', color: '#9CA3AF' },
  { id: 'priority-high',   label: 'High',   color: '#EF4444' },
]

// Patch any builtin select property that is missing its default options
function patchBuiltinOptions(props: BoardProperty[], boardType: string): BoardProperty[] {
  const buckets = BOARD_BUCKETS[boardType] ?? []
  return props.map((p) => {
    if (p.id === 'builtin-status' && (!p.options || p.options.length === 0))
      return { ...p, options: STATUS_OPTIONS }
    if (p.id === 'builtin-priority' && (!p.options || p.options.length === 0))
      return { ...p, options: PRIORITY_OPTIONS }
    if (p.id === 'builtin-bucket' && (!p.options || p.options.length === 0) && buckets.length > 0)
      return { ...p, options: buckets.map((b, i) => ({ id: `bucket-${i}`, label: b, color: OPTION_COLORS[i % OPTION_COLORS.length] })) }
    return p
  })
}

// Default properties seeded when a board has none yet
function getDefaultProperties(boardType: string): BoardProperty[] {
  const buckets = BOARD_BUCKETS[boardType] ?? []
  return [
    { id: 'builtin-client',    name: 'Client',      icon: 'User',          type: 'text',      order: 0 },
    { id: 'builtin-status',    name: 'Status',      icon: 'CircleDot',     type: 'select',    order: 1, options: STATUS_OPTIONS },
    { id: 'builtin-priority',  name: 'Priority',    icon: 'Zap',           type: 'select',    order: 2, options: PRIORITY_OPTIONS },
    { id: 'builtin-date',      name: 'Date',        icon: 'CalendarRange', type: 'daterange', order: 3 },
    { id: 'builtin-assignees', name: 'Assigned To', icon: 'Users',         type: 'person',    order: 4 },
    { id: 'builtin-labels',    name: 'Labels',      icon: 'Tag',           type: 'tags',      order: 5 },
    {
      id: 'builtin-bucket', name: 'Bucket', icon: 'Layers', type: 'select', order: 6,
      options: buckets.map((b, i) => ({ id: `bucket-${i}`, label: b, color: OPTION_COLORS[i % OPTION_COLORS.length] })),
    },
    { id: 'builtin-awb',       name: 'AWB',         icon: 'Plane',         type: 'text',      order: 7 },
    { id: 'builtin-po',        name: 'P.O. Number', icon: 'Hash',          type: 'text',      order: 8 },
    { id: 'builtin-notes',     name: 'Notes',       icon: 'StickyNote',    type: 'text',      order: 9 },
  ]
}

interface Props {
  board: Board
  onBack: () => void
  onBoardUpdate: (updated: Board) => void
}

export default function BoardTemplateEditor({ board, onBack, onBoardUpdate }: Props) {
  const [clients, setClients] = useState<Client[]>([])

  useEffect(() => {
    const unsub = subscribeToClients(setClients)
    return unsub
  }, [])
  const [properties, setProperties] = useState<BoardProperty[]>(() => {
    const existing = board.customProperties ?? []
    if (existing.length === 0) return getDefaultProperties(board.type)
    return patchBuiltinOptions([...existing].sort((a, b) => a.order - b.order), board.type)
  })
  const [showAddModal, setShowAddModal]       = useState(false)
  const [renamingId, setRenamingId]           = useState<string | null>(null)
  const [renameValue, setRenameValue]         = useState('')
  const [deletingId, setDeletingId]           = useState<string | null>(null)
  const [iconPickerId, setIconPickerId]       = useState<string | null>(null)
  const [typePickerId, setTypePickerId]       = useState<string | null>(null)
  const [settingsOpenId, setSettingsOpenId]   = useState<string | null>(null)
  const [colorPickerKey, setColorPickerKey]   = useState<string | null>(null) // "propId:optionId"
  const [editingName, setEditingName]         = useState(false)
  const [boardNameVal, setBoardNameVal]       = useState(board.name)
  const [localBoard, setLocalBoard]           = useState(board)
  const dragIndex = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx]         = useState<number | null>(null)

  // Seed defaults or patch missing builtin options in Firestore on first open
  useEffect(() => {
    const existing = board.customProperties ?? []
    if (existing.length === 0) {
      updateBoardProperties(board.id, getDefaultProperties(board.type)).catch(console.error)
    } else {
      const needsPatch = existing.some((p) =>
        (['builtin-status', 'builtin-priority', 'builtin-bucket'].includes(p.id)) &&
        (!p.options || p.options.length === 0)
      )
      if (needsPatch) {
        updateBoardProperties(board.id, patchBuiltinOptions(existing, board.type)).catch(console.error)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id])

  async function saveProperties(updated: BoardProperty[]) {
    setProperties(updated)
    await updateBoardProperties(localBoard.id, updated)
  }

  async function handleAddProperty(data: Omit<BoardProperty, 'id' | 'order'>) {
    const newProp: BoardProperty = { ...data, id: crypto.randomUUID(), order: properties.length }
    await saveProperties([...properties, newProp])
  }

  async function handleDelete(id: string) {
    const updated = properties
      .filter((p) => p.id !== id)
      .map((p, i) => ({ ...p, order: i }))
    setDeletingId(null)
    await saveProperties(updated)
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

  async function handleIconChange(id: string, iconName: string) {
    setIconPickerId(null)
    await saveProperties(properties.map((p) => p.id === id ? { ...p, icon: iconName } : p))
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

      {/* Properties */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
          Properties
        </h3>

        {properties.length > 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-3">
            {properties.map((prop, i) => {
              const isSettingsOpen = settingsOpenId === prop.id
              const isOptionType = ['select', 'multiselect', 'tags'].includes(prop.type)
              const isBuiltin = prop.id.startsWith('builtin-')
              return (
                <div key={prop.id}>
                  {/* Main row */}
                  <div
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    className={`group/prop flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-gray-800 transition-colors ${
                      dragOverIdx === i ? 'border-t-2 border-green-500' : ''
                    } ${i < properties.length - 1 || isSettingsOpen ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
                  >
                    {/* Drag handle */}
                    <button className="text-gray-300 dark:text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0">
                      <GripVertical size={16} />
                    </button>

                    {/* Icon */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setIconPickerId(iconPickerId === prop.id ? null : prop.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      >
                        <DynamicIcon name={prop.icon} size={14} />
                      </button>
                      {iconPickerId === prop.id && (
                        <IconPickerPopover
                          onSelect={(n) => handleIconChange(prop.id, n)}
                          onClose={() => setIconPickerId(null)}
                        />
                      )}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
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
                          className="w-full rounded border border-green-500 bg-white px-1.5 py-0.5 text-sm dark:bg-gray-700 dark:text-white focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => { setRenamingId(prop.id); setRenameValue(prop.name) }}
                          className="truncate text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left w-full"
                        >
                          {prop.name}
                        </button>
                      )}
                    </div>

                    {/* Type badge */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setTypePickerId(typePickerId === prop.id ? null : prop.id)}
                        className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        {PROPERTY_TYPE_LABELS[prop.type]}
                      </button>
                      {typePickerId === prop.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setTypePickerId(null)} />
                          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden max-h-56 overflow-y-auto">
                            {PROPERTY_TYPES.map((t) => (
                              <button
                                key={t}
                                onClick={() => handleTypeChange(prop.id, t)}
                                className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                                  prop.type === t
                                    ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                                }`}
                              >
                                {PROPERTY_TYPE_LABELS[t]}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Star (display property) + Settings + Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      {deletingId === prop.id ? (
                        <>
                          <span className="text-xs text-red-500">Delete?</span>
                          <button onClick={() => handleDelete(prop.id)} className="text-xs font-semibold text-red-500 hover:text-red-700">Yes</button>
                          <button onClick={() => setDeletingId(null)} className="text-xs text-gray-400 hover:text-gray-600">No</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggleDisplay(prop.id)}
                            title={prop.display ? 'Display property (shown on cards)' : 'Set as display property'}
                            className={`transition-colors ${
                              prop.display
                                ? 'text-amber-400'
                                : 'opacity-0 group-hover/prop:opacity-100 text-gray-300 hover:text-amber-400 dark:text-gray-600'
                            }`}
                          >
                            <Star size={14} fill={prop.display ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => setSettingsOpenId(isSettingsOpen ? null : prop.id)}
                            className={`transition-opacity ${
                              isSettingsOpen
                                ? 'text-green-500'
                                : 'opacity-0 group-hover/prop:opacity-100 text-gray-300 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-300'
                            }`}
                            title="Property settings"
                          >
                            <Settings size={14} />
                          </button>
                          {!isBuiltin && (
                            <button
                              onClick={() => setDeletingId(prop.id)}
                              className="opacity-0 group-hover/prop:opacity-100 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-opacity"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Settings expansion */}
                  {isSettingsOpen && (
                    <div className="bg-gray-50 dark:bg-gray-800/60 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                      {isOptionType ? (
                        /* Options editor */
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Options</p>
                          <div className="space-y-1.5 mb-2">
                            {(prop.options ?? []).map((opt) => {
                              const pickerKey = `${prop.id}:${opt.id}`
                              const isPickerOpen = colorPickerKey === pickerKey
                              return (
                              <div key={opt.id} className="flex items-center gap-2">
                                <div className="relative shrink-0">
                                  <button
                                    onClick={() => setColorPickerKey(isPickerOpen ? null : pickerKey)}
                                    className="h-4 w-4 rounded-full border border-white shadow-sm hover:scale-110 transition-transform"
                                    style={{ backgroundColor: opt.color }}
                                    title="Change color"
                                  />
                                  {isPickerOpen && (
                                    <ColorPickerPopover
                                      color={opt.color}
                                      onChange={(newColor) => {
                                        const updatedOptions = (prop.options ?? []).map((o) =>
                                          o.id === opt.id ? { ...o, color: newColor } : o
                                        )
                                        saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: updatedOptions } : p))
                                      }}
                                      onClose={() => setColorPickerKey(null)}
                                    />
                                  )}
                                </div>
                                <input
                                  key={opt.id + opt.label}
                                  defaultValue={opt.label}
                                  onBlur={(e) => {
                                    const val = e.target.value.trim()
                                    if (!val || val === opt.label) return
                                    const updatedOptions = (prop.options ?? []).map((o) =>
                                      o.id === opt.id ? { ...o, label: val } : o
                                    )
                                    saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: updatedOptions } : p))
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                  className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-green-500"
                                />
                                <button
                                  onClick={() => {
                                    const updatedOptions = (prop.options ?? []).filter((o) => o.id !== opt.id)
                                    saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: updatedOptions } : p))
                                  }}
                                  className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            )})}
                          </div>
                          <button
                            onClick={() => {
                              const newOption: SelectOption = {
                                id: crypto.randomUUID(),
                                label: 'New option',
                                color: OPTION_COLORS[(prop.options ?? []).length % OPTION_COLORS.length],
                              }
                              const updatedOptions = [...(prop.options ?? []), newOption]
                              saveProperties(properties.map((p) => p.id === prop.id ? { ...p, options: updatedOptions } : p))
                            }}
                            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                          >
                            <Plus size={13} />
                            Add option
                          </button>
                        </div>
                      ) : prop.id === 'builtin-client' ? (
                        /* Client field - show dynamic clients from store */
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                            Available Clients ({clients.length})
                          </p>
                          <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
                            {clients.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No clients found. Create clients from the task modal.</p>
                            ) : (
                              clients.map((client) => (
                                <div key={client.id} className="flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full bg-green-500" />
                                  <span className="text-xs text-gray-700 dark:text-gray-300">{client.name}</span>
                                </div>
                              ))
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-2">
                            Clients are managed dynamically and appear automatically in task dropdowns.
                          </p>
                        </div>
                      ) : (
                        /* Required toggle for non-option types */
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Required field</span>
                          <button
                            onClick={() => saveProperties(properties.map((p) =>
                              p.id === prop.id ? { ...p, required: !p.required } : p
                            ))}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              prop.required ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              prop.required ? 'translate-x-4' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Add property */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-green-500 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 transition-colors"
        >
          <Plus size={16} />
          Add Property
        </button>
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
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute left-0 top-full z-30 mt-1 w-[168px] rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 p-3">
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
