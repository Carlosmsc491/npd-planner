// src/renderer/src/lib/boardProperties.ts
//
// SINGLE SOURCE OF TRUTH for board templates (Phase 1 of the flexible-boards
// refactor). Replaces the divergent hardcoded property lists that lived in
// NewBoardModal, BoardTemplateEditor and the per-id switches in NewTaskModal /
// TaskPage.
//
// Core idea — every property decouples three things:
//   • type  → which widget renders it          (text, select, person, daterange…)
//   • bind  → which Task column stores it       (bucket, assignees, dates…)  ← optional
//   • name  → the human label                   (free text, user-editable)
//
// A "builtin" is just a property whose id is in BUILTIN_REGISTRY and which has a
// bind to a top-level Task column. A "custom" property has no entry here and is
// stored in Task.customFields[id]. Because rendering/storage are driven by
// type/bind (never by the literal id string), users can rename, reorder or
// retype a property without breaking views, calendar, filters or notifications.

import type { Board, BoardProperty, BoardType, PropertyBind, PropertyType, SelectOption } from '../types'
import { BOARD_BUCKETS } from '../utils/colorUtils'

// Inlined from propertyUtils (which pulls in lucide-react) so this module stays
// UI-free and unit-testable in a plain node environment.
const OPTION_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
]

// ── Canonical option sets ──────────────────────────────────────────────────
export const STATUS_OPTIONS: SelectOption[] = [
  { id: 'status-todo',       label: 'To Do',       color: '#9CA3AF' },
  { id: 'status-inprogress', label: 'In Progress', color: '#F59E0B' },
  { id: 'status-review',     label: 'Review',      color: '#378ADD' },
  { id: 'status-done',       label: 'Done',        color: '#1D9E75' },
]

export const PRIORITY_OPTIONS: SelectOption[] = [
  { id: 'priority-low',    label: 'Low',    color: '#9CA3AF', icon: 'ArrowDown'   },
  { id: 'priority-normal', label: 'Normal', color: '#6B7280', icon: 'Minus'       },
  { id: 'priority-high',   label: 'High',   color: '#F59E0B', icon: 'AlertCircle' },
  { id: 'priority-urgent', label: 'Urgent', color: '#EF4444', icon: 'AlertCircle' },
]

export const VACATION_TYPE_OPTIONS: SelectOption[] = [
  { id: 'type-vacation',     label: 'Vacation',     color: '#378ADD' },
  { id: 'type-sick',         label: 'Sick Day',     color: '#EF4444' },
  { id: 'type-birthday',     label: 'Birthday',     color: '#EC4899' },
  { id: 'type-compensation', label: 'Compensation', color: '#F59E0B' },
]

export function bucketOptionsFor(boardType: string): SelectOption[] {
  return (BOARD_BUCKETS[boardType] ?? []).map((b, i) => ({
    id: `bucket-${i}`,
    label: b,
    color: OPTION_COLORS[i % OPTION_COLORS.length],
  }))
}

// ── Builtin registry ───────────────────────────────────────────────────────
// `bind` here is the DEFAULT for planner/custom boards. builtin-client is the
// one exception: on person boards (trips/vacations) it is the Person field and
// binds to `assignees` — resolved by resolveBind().

interface BuiltinDef {
  name: string
  type: PropertyType
  icon: string
  bind?: PropertyBind
  /** default select options, if any (may depend on board type) */
  options?: (boardType: string) => SelectOption[]
}

export const BUILTIN_REGISTRY: Record<string, BuiltinDef> = {
  'builtin-client':    { name: 'Customer',     type: 'text',      icon: 'User',          bind: 'clientId' },
  'builtin-division':  { name: 'Division',     type: 'text',      icon: 'GitBranch',     bind: 'divisionId' },
  'builtin-status':    { name: 'Status',       type: 'select',    icon: 'CircleDot',     bind: 'status',   options: () => STATUS_OPTIONS },
  'builtin-priority':  { name: 'Priority',     type: 'select',    icon: 'Zap',           bind: 'priority', options: () => PRIORITY_OPTIONS },
  'builtin-bucket':    { name: 'Bucket',       type: 'select',    icon: 'Layers',        bind: 'bucket',   options: bucketOptionsFor },
  'builtin-assignees': { name: 'Assigned To',  type: 'person',    icon: 'Users',         bind: 'assignees' },
  'builtin-labels':    { name: 'Labels',       type: 'tags',      icon: 'Tag',           bind: 'labelIds' },
  'builtin-date':      { name: 'Date',         type: 'daterange', icon: 'CalendarRange', bind: 'dates' },
  'builtin-awb':       { name: 'Order Status', type: 'text',      icon: 'Plane',         bind: 'awbs' },
  'builtin-po':        { name: 'P.O. Number',  type: 'text',      icon: 'Hash',          bind: 'poEntries' },
  'builtin-notes':     { name: 'Notes',        type: 'text',      icon: 'StickyNote',    bind: 'notes' },
  // Vacations "Type" is a builtin id but has no Task column — stored in customFields.
  'builtin-type':      { name: 'Type',         type: 'select',    icon: 'Tag',           options: () => VACATION_TYPE_OPTIONS },
  // System sections — rendered by dedicated components in the task detail. They
  // live in the template so they can be reordered / hidden, but are not generic
  // user fields (no type picker, no options).
  'builtin-eventdates':  { name: 'Event Dates', type: 'multidate',   icon: 'CalendarRange', bind: 'taskDates' },
  'builtin-description': { name: 'Description', type: 'richtext',    icon: 'FileText',  bind: 'description' },
  'builtin-followups':   { name: 'Follow-ups',  type: 'followups',   icon: 'Flag',      bind: 'followUps' },
  'builtin-attachments': { name: 'Attachments', type: 'attachments', icon: 'Paperclip', bind: 'attachments' },
}

// System sections: always present on every board (appended by normalize if
// missing), rendered by dedicated components, reorderable + hideable but not
// type-editable. Order here = default order at the bottom of a board.
export const SYSTEM_PROPERTY_IDS = ['builtin-eventdates', 'builtin-description', 'builtin-followups', 'builtin-attachments'] as const

export function isSystemProperty(id: string): boolean {
  return (SYSTEM_PROPERTY_IDS as readonly string[]).includes(id)
}

export function isBuiltin(id: string): boolean {
  return id.startsWith('builtin-')
}

/** Resolve a builtin's storage binding for a given board type. */
export function resolveBind(id: string, boardType: string): PropertyBind | undefined {
  // On person boards the "client" slot is actually the Person → binds to assignees
  if (id === 'builtin-client' && (boardType === 'trips' || boardType === 'vacations')) {
    return 'assignees'
  }
  return BUILTIN_REGISTRY[id]?.bind
}

// ── Allowed builtins per board type ─────────────────────────────────────────
// Builtins not in a board's allowlist are stripped. Custom props always pass.
const SYSTEM_IDS_ARR: string[] = [...SYSTEM_PROPERTY_IDS]

const ALLOWED_BUILTINS: Record<string, Set<string>> = {
  planner: new Set([
    'builtin-client', 'builtin-status', 'builtin-priority', 'builtin-date',
    'builtin-assignees', 'builtin-bucket', 'builtin-awb', 'builtin-po',
    'builtin-division', 'builtin-labels', 'builtin-notes', ...SYSTEM_IDS_ARR,
  ]),
  trips: new Set([
    'builtin-client', 'builtin-status', 'builtin-priority', 'builtin-date',
    'builtin-bucket', 'builtin-labels', 'builtin-notes', ...SYSTEM_IDS_ARR,
  ]),
  vacations: new Set([
    'builtin-client', 'builtin-status', 'builtin-date', 'builtin-bucket',
    'builtin-type', 'builtin-labels', 'builtin-notes', ...SYSTEM_IDS_ARR,
  ]),
  custom: new Set([
    'builtin-client', 'builtin-status', 'builtin-priority', 'builtin-date',
    'builtin-assignees', 'builtin-bucket', 'builtin-labels', 'builtin-notes', ...SYSTEM_IDS_ARR,
  ]),
}

function allowedFor(boardType: string): Set<string> {
  return ALLOWED_BUILTINS[boardType] ?? ALLOWED_BUILTINS.custom
}

// ── Default templates per board type ────────────────────────────────────────
// Mirrors exactly what TaskPage renders today, but derived from the registry so
// there is one definition instead of three.

function mk(id: string, boardType: string, order: number, overrides: Partial<BoardProperty> = {}): BoardProperty {
  const def = BUILTIN_REGISTRY[id]
  return {
    id,
    name: def.name,
    type: def.type,
    icon: def.icon,
    order,
    bind: resolveBind(id, boardType),
    ...(def.options ? { options: def.options(boardType) } : {}),
    ...overrides,
  }
}

// The system sections that every board ends with (Description, Follow-ups,
// Attachments), in order. Always appended after the type-specific fields.
function systemDefaults(startOrder: number, boardType: BoardType): BoardProperty[] {
  return SYSTEM_PROPERTY_IDS.map((id, i) => mk(id, boardType, startOrder + i))
}

export function getDefaultBoardProperties(boardType: BoardType): BoardProperty[] {
  let base: BoardProperty[]
  if (boardType === 'planner') {
    base = [
      mk('builtin-client', boardType, 0, { name: 'Customer' }),
      mk('builtin-bucket', boardType, 1),
      mk('builtin-status', boardType, 2),
      mk('builtin-assignees', boardType, 3),
      mk('builtin-priority', boardType, 4),
      mk('builtin-date', boardType, 5),
      mk('builtin-awb', boardType, 6, { name: 'Order Status' }),
      mk('builtin-po', boardType, 7),
    ]
  } else if (boardType === 'trips') {
    base = [
      mk('builtin-client', boardType, 0, { name: 'Person', icon: 'User' }),
      mk('builtin-status', boardType, 1),
      mk('builtin-priority', boardType, 2),
      mk('builtin-date', boardType, 3),
      mk('builtin-bucket', boardType, 4),
    ]
  } else if (boardType === 'vacations') {
    base = [
      mk('builtin-client', boardType, 0, { name: 'Person', icon: 'User' }),
      mk('builtin-status', boardType, 1),
      mk('builtin-date', boardType, 2),
      mk('builtin-bucket', boardType, 3),
      mk('builtin-type', boardType, 4, { display: true }),
    ]
  } else {
    base = [
      mk('builtin-client', boardType, 0, { name: 'Client' }),
      mk('builtin-status', boardType, 1),
      mk('builtin-priority', boardType, 2),
      mk('builtin-date', boardType, 3),
      mk('builtin-assignees', boardType, 4),
      mk('builtin-bucket', boardType, 5),
    ]
  }
  return [...base, ...systemDefaults(base.length, boardType)]
}

// Build a fresh template from a set of selected builtin ids (used by the New
// Board wizard) so new boards are born bind-aware with the right type + options.
export function buildBoardPropertiesFromBuiltins(ids: string[], boardType: BoardType): BoardProperty[] {
  return ids
    .filter((id) => BUILTIN_REGISTRY[id])
    .map((id, i) => mk(id, boardType, i))
}

// ── Normalization (lazy, read-time, NON-destructive migration) ──────────────
// Called wherever a board's properties are consumed. Backfills bind/type/icon/
// options on existing builtins, strips foreign builtins, and falls back to the
// type default when a board has no template yet. Never mutates Firestore and
// always preserves user renames, reorder and custom properties.

function needsOptions(type: PropertyType): boolean {
  return type === 'select' || type === 'multiselect'
}

// Route a draft of property values into Task.customFields: only properties with
// NO bind land here (a bound builtin is stored in its Task column instead).
// builtin-type (a builtin with no bind) correctly stays in customFields.
export function pickCustomFields(
  props: BoardProperty[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of props) {
    if (p.bind || p.type === 'section') continue
    const v = values[p.id]
    const empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
    if (!empty) out[p.id] = v
  }
  return out
}

export function normalizeBoardProperties(board: Pick<Board, 'type' | 'customProperties'>): BoardProperty[] {
  const boardType = board.type
  const source = (board.customProperties && board.customProperties.length > 0)
    ? board.customProperties
    : getDefaultBoardProperties(boardType)

  const allowed = allowedFor(boardType)

  const normalized = source
    // strip builtins that don't belong to this board type; keep all custom props
    .filter((p) => !isBuiltin(p.id) || allowed.has(p.id))
    .map((p) => {
      const def = BUILTIN_REGISTRY[p.id]
      if (!def) return p  // custom property — leave entirely untouched

      const type = p.type ?? def.type
      const merged: BoardProperty = {
        ...p,
        name: p.name ?? def.name,
        type,
        icon: p.icon ?? def.icon,
        // bind is derived, never user-set — always trust the registry/board type
        bind: resolveBind(p.id, boardType),
      }
      // seed default options for select-like builtins that are missing them
      if (needsOptions(type) && (!p.options || p.options.length === 0) && def.options) {
        merged.options = def.options(boardType)
      }
      return merged
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  // Ensure system sections always exist (append any missing) so the task detail
  // keeps rendering Description / Follow-ups / Attachments even on older
  // templates. If a board already has one (reordered or hidden), it is kept as-is
  // and never duplicated.
  const present = new Set(normalized.map((p) => p.id))
  const missing = SYSTEM_PROPERTY_IDS.filter((id) => !present.has(id))
  const withSystem = [...normalized, ...missing.map((id) => mk(id, boardType, 0))]

  return withSystem.map((p, i) => ({ ...p, order: i }))
}
