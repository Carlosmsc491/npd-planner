import { describe, it, expect } from 'vitest'
import {
  BUILTIN_REGISTRY,
  resolveBind,
  getDefaultBoardProperties,
  normalizeBoardProperties,
  pickCustomFields,
  buildBoardPropertiesFromBuiltins,
  isSystemProperty,
  availableBuiltins,
} from '../src/renderer/src/lib/boardProperties'
import type { Board, BoardProperty } from '../src/renderer/src/types'

// Minimal board factory (only the fields normalize() reads)
function board(type: Board['type'], customProperties?: BoardProperty[]): Pick<Board, 'type' | 'customProperties'> {
  return { type, customProperties }
}

describe('getDefaultBoardProperties', () => {
  it('gives every default property a bind (builtins are never unbound by default)', () => {
    for (const t of ['planner', 'trips', 'vacations', 'custom'] as const) {
      const props = getDefaultBoardProperties(t)
      expect(props.length).toBeGreaterThan(0)
      for (const p of props) {
        if (p.id === 'builtin-type') continue // intentionally stored in customFields
        expect(p.bind, `${t}/${p.id} should have a bind`).toBeTruthy()
      }
    }
  })

  it('binds the person field to assignees on person boards, clientId on planner', () => {
    const trips = getDefaultBoardProperties('trips').find((p) => p.id === 'builtin-client')
    const planner = getDefaultBoardProperties('planner').find((p) => p.id === 'builtin-client')
    expect(trips?.bind).toBe('assignees')
    expect(trips?.name).toBe('Person')
    expect(planner?.bind).toBe('clientId')
  })

  it('seeds bucket options from BOARD_BUCKETS per board type', () => {
    const bucket = getDefaultBoardProperties('planner').find((p) => p.id === 'builtin-bucket')
    expect(bucket?.options?.map((o) => o.label)).toContain('SAMPLES/SHIP OUT')
    const tripsBucket = getDefaultBoardProperties('trips').find((p) => p.id === 'builtin-bucket')
    expect(tripsBucket?.options?.map((o) => o.label)).toEqual(['Confirmed', 'Pending', 'Completed'])
  })
})

describe('resolveBind', () => {
  it('maps builtin-client to assignees only on person boards', () => {
    expect(resolveBind('builtin-client', 'planner')).toBe('clientId')
    expect(resolveBind('builtin-client', 'custom')).toBe('clientId')
    expect(resolveBind('builtin-client', 'trips')).toBe('assignees')
    expect(resolveBind('builtin-client', 'vacations')).toBe('assignees')
  })

  it('returns the registry bind for other builtins', () => {
    expect(resolveBind('builtin-bucket', 'planner')).toBe('bucket')
    expect(resolveBind('builtin-date', 'planner')).toBe('dates')
    expect(resolveBind('builtin-type', 'vacations')).toBeUndefined()
  })
})

describe('normalizeBoardProperties', () => {
  it('falls back to the type default when the board has no template', () => {
    const props = normalizeBoardProperties(board('planner', undefined))
    expect(props).toEqual(getDefaultBoardProperties('planner'))
    const empty = normalizeBoardProperties(board('planner', []))
    expect(empty.length).toBe(getDefaultBoardProperties('planner').length)
  })

  it('backfills bind/type/icon on a legacy builtin that is missing them', () => {
    // Old data: a bucket property saved before `bind` existed
    const legacy = [
      { id: 'builtin-bucket', name: 'Bucket', type: 'select', icon: 'Layers', order: 0 },
    ] as unknown as BoardProperty[]
    const [bucket] = normalizeBoardProperties(board('planner', legacy))
    expect(bucket.bind).toBe('bucket')
    expect(bucket.options?.length).toBeGreaterThan(0) // options seeded
  })

  it('preserves a user-renamed builtin but still binds it correctly', () => {
    const renamed = [
      { id: 'builtin-bucket', name: 'Stage', type: 'select', icon: 'Layers', order: 0, options: [{ id: 'x', label: 'Backlog', color: '#000' }] },
    ] as BoardProperty[]
    const [bucket] = normalizeBoardProperties(board('planner', renamed))
    expect(bucket.name).toBe('Stage')          // rename kept
    expect(bucket.bind).toBe('bucket')          // still writes to task.bucket
    expect(bucket.options?.[0].label).toBe('Backlog') // user options kept, not overwritten
  })

  it('leaves custom (non-builtin) properties completely untouched', () => {
    const custom: BoardProperty = { id: 'fld_abc', name: 'Fabric', type: 'text', icon: 'Box', order: 0 }
    const [out] = normalizeBoardProperties(board('planner', [custom]))
    expect(out).toEqual({ ...custom, order: 0 })
    expect(out.bind).toBeUndefined() // custom → stored in customFields
  })

  it('strips builtins that do not belong to the board type', () => {
    // AWB/PO are planner-only; they must be removed from a trips board
    const props = [
      { id: 'builtin-client', name: 'Person', type: 'text', icon: 'User', order: 0 },
      { id: 'builtin-awb', name: 'AWB', type: 'text', icon: 'Plane', order: 1 },
      { id: 'builtin-po', name: 'PO', type: 'text', icon: 'Hash', order: 2 },
      { id: 'builtin-bucket', name: 'Bucket', type: 'select', icon: 'Layers', order: 3 },
    ] as BoardProperty[]
    const out = normalizeBoardProperties(board('trips', props))
    const ids = out.map((p) => p.id)
    expect(ids).not.toContain('builtin-awb')
    expect(ids).not.toContain('builtin-po')
    expect(ids).toContain('builtin-client')
    expect(ids).toContain('builtin-bucket')
  })

  it('reindexes order sequentially after stripping', () => {
    const props = [
      { id: 'builtin-client', name: 'Person', type: 'text', icon: 'User', order: 5 },
      { id: 'builtin-awb', name: 'AWB', type: 'text', icon: 'Plane', order: 9 },
      { id: 'builtin-bucket', name: 'Bucket', type: 'select', icon: 'Layers', order: 12 },
    ] as BoardProperty[]
    const out = normalizeBoardProperties(board('trips', props))
    // orders are always 0..n-1
    expect(out.map((p) => p.order)).toEqual(out.map((_, i) => i))
    // AWB stripped; the non-system fields keep their order
    const nonSystem = out.filter((p) => !isSystemProperty(p.id))
    expect(nonSystem.map((p) => p.id)).toEqual(['builtin-client', 'builtin-bucket'])
  })

  it('appends the system sections (description/follow-ups/attachments) if missing', () => {
    const out = normalizeBoardProperties(board('planner', [
      { id: 'builtin-bucket', name: 'Bucket', type: 'select', icon: 'Layers', order: 0 },
    ] as BoardProperty[]))
    const ids = out.map((p) => p.id)
    expect(ids).toContain('builtin-eventdates')
    expect(ids).toContain('builtin-description')
    expect(ids).toContain('builtin-followups')
    expect(ids).toContain('builtin-attachments')
    // bound to their Task columns
    expect(out.find((p) => p.id === 'builtin-eventdates')?.bind).toBe('taskDates')
    expect(out.find((p) => p.id === 'builtin-description')?.bind).toBe('description')
    expect(out.find((p) => p.id === 'builtin-attachments')?.bind).toBe('attachments')
    expect(isSystemProperty('builtin-eventdates')).toBe(true)
  })

  it('a custom board with no template starts blank — only system sections', () => {
    const out = normalizeBoardProperties(board('custom', []))
    const ids = out.map((p) => p.id)
    expect(ids).not.toContain('builtin-bucket')   // no default task fields
    expect(ids).not.toContain('builtin-status')
    expect(ids.every((id) => isSystemProperty(id))).toBe(true)
    expect(ids).toContain('builtin-description')
  })

  it('does not duplicate or unhide a hidden system section', () => {
    const out = normalizeBoardProperties(board('planner', [
      { id: 'builtin-attachments', name: 'Attachments', type: 'attachments', icon: 'Paperclip', order: 0, bind: 'attachments', hidden: true },
    ] as BoardProperty[]))
    const attach = out.filter((p) => p.id === 'builtin-attachments')
    expect(attach.length).toBe(1)        // not re-added
    expect(attach[0].hidden).toBe(true)  // stays hidden
  })

  it('person-board client field is rebound to assignees on normalize', () => {
    const props = [
      { id: 'builtin-client', name: 'Person', type: 'text', icon: 'User', order: 0, bind: 'clientId' },
    ] as unknown as BoardProperty[]
    const [person] = normalizeBoardProperties(board('vacations', props))
    expect(person.bind).toBe('assignees')
  })

  it('registry covers every builtin id with a name, type and icon', () => {
    for (const [id, def] of Object.entries(BUILTIN_REGISTRY)) {
      expect(def.name, `${id} name`).toBeTruthy()
      expect(def.type, `${id} type`).toBeTruthy()
      expect(def.icon, `${id} icon`).toBeTruthy()
    }
  })
})

describe('buildBoardPropertiesFromBuiltins', () => {
  it('builds bind-aware props with type + options, in the given order', () => {
    const props = buildBoardPropertiesFromBuiltins(['builtin-client', 'builtin-bucket', 'builtin-status'], 'planner')
    expect(props.map((p) => p.id)).toEqual(['builtin-client', 'builtin-bucket', 'builtin-status'])
    expect(props.map((p) => p.order)).toEqual([0, 1, 2])
    expect(props.find((p) => p.id === 'builtin-client')?.bind).toBe('clientId')
    expect(props.find((p) => p.id === 'builtin-bucket')?.options?.length).toBeGreaterThan(0)
    expect(props.find((p) => p.id === 'builtin-status')?.options?.length).toBeGreaterThan(0)
  })

  it('ignores unknown ids', () => {
    const props = buildBoardPropertiesFromBuiltins(['builtin-bucket', 'not-a-builtin'], 'custom')
    expect(props.map((p) => p.id)).toEqual(['builtin-bucket'])
  })
})

describe('availableBuiltins', () => {
  it('offers the smart builtins not already on the board', () => {
    const all = availableBuiltins(new Set())
    expect(all.map((b) => b.id)).toEqual([
      'builtin-bucket', 'builtin-status', 'builtin-priority',
      'builtin-date', 'builtin-assignees', 'builtin-labels',
    ])
    all.forEach((b) => { expect(b.name).toBeTruthy(); expect(b.icon).toBeTruthy() })
  })

  it('hides builtins already present (added at most once)', () => {
    const out = availableBuiltins(new Set(['builtin-bucket', 'builtin-date']))
    const ids = out.map((b) => b.id)
    expect(ids).not.toContain('builtin-bucket')
    expect(ids).not.toContain('builtin-date')
    expect(ids).toContain('builtin-status')
  })
})

describe('pickCustomFields', () => {
  const props = [
    { id: 'builtin-bucket', name: 'Bucket', type: 'select', icon: 'Layers', order: 0, bind: 'bucket' },
    { id: 'builtin-type',   name: 'Type',   type: 'select', icon: 'Tag',    order: 1 },               // no bind
    { id: 'fld_fabric',     name: 'Fabric', type: 'text',   icon: 'Box',    order: 2 },               // custom
    { id: 'sec_1',          name: 'Group',  type: 'section', icon: 'Minus',  order: 3 },              // section
  ] as unknown as import('../src/renderer/src/types').BoardProperty[]

  it('keeps only unbound, non-section, non-empty values', () => {
    const out = pickCustomFields(props, {
      'builtin-bucket': 'FedEx',     // bound → excluded
      'builtin-type': 'Vacation',    // unbound builtin → kept
      'fld_fabric': 'Cotton',        // custom → kept
      'sec_1': 'whatever',           // section → excluded
    })
    expect(out).toEqual({ 'builtin-type': 'Vacation', 'fld_fabric': 'Cotton' })
  })

  it('omits empty values (empty string / empty array / undefined)', () => {
    const out = pickCustomFields(props, { 'builtin-type': '', 'fld_fabric': [] })
    expect(out).toEqual({})
  })
})
