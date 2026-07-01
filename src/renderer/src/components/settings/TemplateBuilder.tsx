// src/renderer/src/components/settings/TemplateBuilder.tsx
//
// Presentational template builder: the "Fields — drag to reorder" UI extracted
// from BoardTemplateEditor so it can be reused both in Settings (editing an
// existing board) and in the New Board wizard (building a board before it
// exists). It is fully controlled — it never touches Firestore; the parent owns
// persistence via onChange.

import { useState, useRef } from 'react'
import { Trash2, GripVertical, Plus, Star, X, Eye, EyeOff } from 'lucide-react'
import { DynamicIcon, PROPERTY_TYPE_LABELS, OPTION_COLORS } from '../../utils/propertyUtils'
import { PRIORITY_OPTIONS, isSystemProperty, availableBuiltins, buildBoardPropertiesFromBuiltins } from '../../lib/boardProperties'
import { useTaskStore } from '../../store/taskStore'
import IconPickerPopover from './IconPickerPopover'
import AddPropertyModal from './AddPropertyModal'
import type { BoardProperty, BoardType, PropertyType, SelectOption } from '../../types'

const PROPERTY_TYPES: PropertyType[] = [
  'text', 'number', 'select', 'multiselect', 'date', 'daterange',
  'person', 'checkbox', 'url', 'attachment', 'tags', 'email', 'phone',
  'richtext', 'multidate', 'followups',
]

// Suggest an icon based on option label
export function getSuggestedIcon(label: string): string {
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

interface Props {
  properties: BoardProperty[]
  onChange: (properties: BoardProperty[]) => void
  isOwner: boolean
  boardType: BoardType
}

export default function TemplateBuilder({ properties, onChange, isOwner, boardType }: Props) {
  const setToast = useTaskStore((s) => s.setToast)
  const [showAddModal, setShowAddModal]     = useState(false)
  const [renamingId, setRenamingId]         = useState<string | null>(null)
  const [renameValue, setRenameValue]       = useState('')
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [typePickerId, setTypePickerId]     = useState<string | null>(null)
  const [colorPickerKey, setColorPickerKey] = useState<string | null>(null)
  const dragIndex = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx]       = useState<number | null>(null)

  function handleAddProperty(data: Omit<BoardProperty, 'id' | 'order'>) {
    onChange([...properties, { ...data, id: crypto.randomUUID(), order: properties.length }])
  }

  // Add a "smart" builtin (Bucket/Status/Priority/Date/Assignees/Labels), bound
  // to its Task column so columns/calendar/Group By work. At most once per board.
  function handleAddBuiltin(id: string) {
    if (properties.some((p) => p.id === id)) return
    const [bp] = buildBoardPropertiesFromBuiltins([id], boardType)
    if (bp) onChange([...properties, { ...bp, order: properties.length }])
    setShowAddModal(false)
  }

  const builtinChoices = availableBuiltins(new Set(properties.map((p) => p.id)))

  function handleAddSection() {
    onChange([...properties, { id: `sec_${crypto.randomUUID()}`, name: 'New Section', type: 'section', icon: 'Minus', order: properties.length }])
  }

  function handleToggleHidden(id: string) {
    onChange(properties.map((p) => p.id === id ? { ...p, hidden: !p.hidden } : p))
  }

  function handleDelete(id: string) {
    setDeletingId(null)
    onChange(properties.filter((p) => p.id !== id).map((p, i) => ({ ...p, order: i })))
  }

  function handleDeleteProperty(propertyId: string) {
    const SYSTEM = ['builtin-client', 'builtin-status', 'builtin-priority', 'builtin-date', 'builtin-assignees', 'builtin-bucket', 'builtin-awb', 'builtin-po']
    if (SYSTEM.includes(propertyId) && !isOwner) {
      setToast({ id: crypto.randomUUID(), type: 'warning', message: 'Only owners can delete system properties' })
      return
    }
    setDeletingId(propertyId)
  }

  function handleRename(id: string) {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (!trimmed) return
    onChange(properties.map((p) => p.id === id ? { ...p, name: trimmed } : p))
  }

  function handleTypeChange(id: string, newType: PropertyType) {
    setTypePickerId(null)
    onChange(properties.map((p) => p.id === id ? { ...p, type: newType } : p))
  }

  function handleToggleDisplay(id: string) {
    onChange(properties.map((p) => ({ ...p, display: p.id === id ? !p.display : false })))
  }

  function handleDragStart(index: number) { dragIndex.current = index }
  function handleDragOver(e: React.DragEvent, index: number) { e.preventDefault(); setDragOverIdx(index) }
  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndex.current
    dragIndex.current = null
    setDragOverIdx(null)
    if (from === null || from === index) return
    const reordered = [...properties]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(index, 0, moved)
    onChange(reordered.map((p, i) => ({ ...p, order: i })))
  }
  function handleDragEnd() { dragIndex.current = null; setDragOverIdx(null) }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Fields — drag to reorder</h3>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">⭐ = shown on cards</span>
      </div>

      {/* Title — always first and fixed */}
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
                <button onClick={() => setDeletingId(prop.id)} className="opacity-0 group-hover/prop:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 dark:text-gray-600 transition-all" title="Delete section">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )
        }

        // ── System property (Description / Event Dates / Follow-ups / Attachments) ──
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
                className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
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
              dragOverIdx === i ? 'border-green-500 border-2 shadow-sm' : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="absolute left-1.5 top-3.5 opacity-0 group-hover/prop:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
              <GripVertical size={14} className="text-gray-300 dark:text-gray-600" />
            </div>

            <div className="px-4 pt-3 pb-3 pl-6">
              {/* Label row */}
              <div className="flex items-center gap-2 mb-2">
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
                    {prop.required && <span className="text-red-500 ml-0.5">*</span>}
                  </button>
                )}

                <div className="flex-1" />

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
                        <div className="absolute right-0 top-full z-[60] mt-1 w-40 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden max-h-64 overflow-y-auto">
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
                <div className="flex flex-wrap gap-1.5 pointer-events-none">
                  {(prop.options ?? PRIORITY_OPTIONS).map((opt) => (
                    <span key={opt.id} className="flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-medium" style={{ borderColor: opt.color, color: opt.color }}>
                      <DynamicIcon name={opt.icon ?? getSuggestedIcon(opt.label)} size={11} />
                      {opt.label}
                    </span>
                  ))}
                </div>
              ) : prop.id === 'builtin-assignees' || prop.type === 'person' ? (
                <div className="flex gap-1.5 pointer-events-none">
                  {['WH', 'EE', 'CS'].map((initials) => (
                    <span key={initials} className="flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-600 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span className="h-4 w-4 rounded-full bg-green-500 flex items-center justify-center text-[8px] font-bold text-white">{initials}</span>
                      {initials === 'WH' ? 'Walter' : initials === 'EE' ? 'Evelyn' : 'Carlos'}
                    </span>
                  ))}
                  <span className="flex items-center gap-1 rounded-full border border-dashed border-gray-200 dark:border-gray-600 px-2 py-0.5 text-xs text-gray-400"><Plus size={10} /> Add</span>
                </div>
              ) : prop.type === 'daterange' ? (
                <div className="flex items-center gap-2 pointer-events-none">
                  <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-400">MM/DD/YYYY</div>
                  <span className="text-gray-400 text-xs">→</span>
                  <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-400">MM/DD/YYYY</div>
                </div>
              ) : prop.id === 'builtin-awb' ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 pointer-events-none">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">P.O. / ORDER # · AWB</p>
                </div>
              ) : prop.id === 'builtin-po' ? null
              : prop.type === 'richtext' ? (
                <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-3 text-sm text-gray-400 pointer-events-none">Rich text…</div>
              ) : prop.type === 'multidate' ? (
                <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-600 px-3 py-2 text-xs text-gray-400 pointer-events-none flex items-center gap-1"><Plus size={12} /> Add date</div>
              ) : prop.type === 'followups' ? (
                <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-600 px-3 py-2 text-xs text-gray-400 pointer-events-none flex items-center gap-2"><span className="h-3.5 w-3.5 rounded border-2 border-gray-300 inline-block" /> Checklist item</div>
              ) : (
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

              {/* Options editor — select/multiselect/tags */}
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
                              <IconPickerPopover onSelect={(n) => { onChange(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, icon: n } : o) } : p)); setColorPickerKey(null) }} onClose={() => setColorPickerKey(null)} />
                            </div>
                          )}
                        </div>
                        <input
                          defaultValue={opt.label}
                          onBlur={(e) => { const val = e.target.value.trim(); if (!val || val === opt.label) return; onChange(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, label: val } : o) } : p)) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          className="bg-transparent border-none focus:outline-none focus:ring-0 px-0 py-0 text-xs font-medium"
                          style={{ color: prop.type === 'select' ? '#fff' : opt.color, width: `${opt.label.length + 2}ch`, minWidth: '40px' }}
                        />
                        <div className="relative ml-0.5">
                          <button onClick={() => setColorPickerKey(isPickerOpen ? null : pickerKey)} className="h-2.5 w-2.5 rounded-full border border-white/50 hover:scale-125 transition-transform" style={{ backgroundColor: opt.color }} title="Change color" />
                          {isPickerOpen && (
                            <div className="absolute left-0 top-full z-[60] mt-1">
                              <ColorPickerPopover color={opt.color} onChange={(newColor) => { onChange(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, color: newColor } : o) } : p)) }} onClose={() => setColorPickerKey(null)} />
                            </div>
                          )}
                        </div>
                        <button onClick={() => { onChange(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).filter((o) => o.id !== opt.id) } : p)) }}
                          className="ml-0.5 opacity-0 group-hover/opt:opacity-100 transition-opacity"
                          style={{ color: prop.type === 'select' ? 'rgba(255,255,255,0.7)' : opt.color }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    )
                  })}
                  <button
                    onClick={() => { const newOpt: SelectOption = { id: crypto.randomUUID(), label: 'New', color: OPTION_COLORS[(prop.options ?? []).length % OPTION_COLORS.length], icon: 'Circle' }; onChange(properties.map((p) => p.id === prop.id ? { ...p, options: [...(p.options ?? []), newOpt] } : p)) }}
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
                      <div key={opt.id} className="group/opt relative flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-medium" style={{ borderColor: opt.color, color: opt.color }}>
                        <input
                          defaultValue={opt.label}
                          onBlur={(e) => { const val = e.target.value.trim(); if (!val || val === opt.label) return; onChange(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, label: val } : o) } : p)) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          className="bg-transparent border-none focus:outline-none focus:ring-0 px-0 py-0 text-xs font-medium"
                          style={{ color: opt.color, width: `${opt.label.length + 2}ch`, minWidth: '40px' }}
                        />
                        <div className="relative">
                          <button onClick={() => setColorPickerKey(isPickerOpen ? null : pickerKey)} className="h-2.5 w-2.5 rounded-full hover:scale-125 transition-transform" style={{ backgroundColor: opt.color }} />
                          {isPickerOpen && (
                            <div className="absolute left-0 top-full z-[60] mt-1">
                              <ColorPickerPopover color={opt.color} onChange={(newColor) => { onChange(properties.map((p) => p.id === prop.id ? { ...p, options: (p.options ?? []).map((o) => o.id === opt.id ? { ...o, color: newColor } : o) } : p)) }} onClose={() => setColorPickerKey(null)} />
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
        <button onClick={() => setShowAddModal(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-green-500 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 transition-all hover:bg-green-50 dark:hover:bg-green-900/10">
          <Plus size={16} /> Add Field
        </button>
        <button onClick={handleAddSection} className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-green-500 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 transition-all hover:bg-green-50 dark:hover:bg-green-900/10" title="Add a section heading / page break">
          <Plus size={16} /> Add Section
        </button>
      </div>

      {showAddModal && (
        <AddPropertyModal
          availableBuiltins={builtinChoices}
          onAddBuiltin={handleAddBuiltin}
          onAdd={handleAddProperty}
          onClose={() => setShowAddModal(false)}
        />
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

export function ColorPickerPopover({ color, onChange, onClose }: {
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
            <button key={c} onClick={() => { onChange(c); setHex(c) }} className="h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110" style={{ backgroundColor: c }}>
              {color === c && (
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
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
