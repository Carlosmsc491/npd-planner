import type { Timestamp } from 'firebase/firestore'

export interface AppUser {
  uid: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'photographer'
  status: 'active' | 'awaiting' | 'suspended'
  areaPermissions?: Record<string, string>
}

export interface SelectOption {
  id: string
  label: string
  color: string
  icon?: string
}

export interface BoardProperty {
  id: string
  name: string
  type: string
  icon: string
  options?: SelectOption[]
  order: number
}

export interface Board {
  id: string
  name: string
  color: string
  type: 'planner' | 'trips' | 'vacations' | 'custom'
  order: number
  customProperties?: BoardProperty[]
  bucketOrder?: string[]
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
  assigneeUid: string | null
}

export interface TaskAttachment {
  id: string
  name: string
  sharePointRelativePath: string
  uploadedBy: string
  uploadedByName?: string
  uploadedAt: Timestamp | null
  status: string
  sizeBytes: number | null
  mimeType: string | null
}

export interface PoEntry {
  id: string
  number: string
  boxes: number
}

export interface AwbEntry {
  id: string
  number: string
  boxes: number
  carrier: string | null
  shipDate: string | null
  eta: string | null
  ata: string | null
  guia: string | null
}

export interface TaskDate {
  id: string
  typeKey: string
  dateStart: Timestamp
  dateEnd: Timestamp | null
}

export interface Task {
  id: string
  boardId: string
  title: string
  clientId: string
  divisionId?: string | null
  status: 'todo' | 'inprogress' | 'review' | 'done'
  priority: 'normal' | 'high'
  assignees: string[]
  labelIds: string[]
  bucket: string
  dateStart: Timestamp | null
  dateEnd: Timestamp | null
  taskDates?: TaskDate[]
  description?: string
  notes: string
  poNumber?: string
  poNumbers?: string[]
  poEntries?: PoEntry[]
  awbs?: AwbEntry[]
  subtasks?: Subtask[]
  attachments?: TaskAttachment[]
  completed: boolean
  createdBy: string
  createdAt: Timestamp
}

export interface Client {
  id: string
  name: string
  active: boolean
}

export interface Division {
  id: string
  clientId: string
  name: string
  active: boolean
}

export interface Label {
  id: string
  name: string
  color: string
  textColor: string
  boardId: string | null
}

export interface DateType {
  id: string
  key: string
  label: string
  icon: string
  color: string
  order: number
}

export const STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

export const STATUS_COLORS: Record<Task['status'], { bg: string; text: string }> = {
  todo:       { bg: '#F1EFE8', text: '#444441' },
  inprogress: { bg: '#FAEEDA', text: '#633806' },
  review:     { bg: '#E6F1FB', text: '#0C447C' },
  done:       { bg: '#E1F5EE', text: '#085041' },
}

// Default bucket order per board type (matches desktop BOARD_BUCKETS)
export const BOARD_BUCKETS: Record<string, string[]> = {
  planner:   ['SAMPLES/SHIP OUT', 'FedEx', 'IN HOUSE MEETING', 'PICTURES', 'WORKSHOPS', 'SHOWS', 'EVENTS'],
  trips:     ['Confirmed', 'Pending', 'Completed'],
  vacations: ['Approved', 'Pending', 'Rejected'],
  custom:    [],
}

/** Bucket color from board's "Bucket" custom property options (matches desktop getBucketColor) */
export function getBucketColor(bucketName: string | undefined, board: Board | null | undefined): string | undefined {
  if (!bucketName || !board) return undefined
  const bucketProp = board.customProperties?.find(
    (p) => p.id === 'builtin-bucket' || p.name === 'Bucket'
  )
  return bucketProp?.options?.find((o) => o.label === bucketName)?.color
}

const INITIAL_COLORS = ['#1D9E75', '#378ADD', '#D4537E', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

export function getInitialsColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return INITIAL_COLORS[Math.abs(hash) % INITIAL_COLORS.length]
}

export function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}
