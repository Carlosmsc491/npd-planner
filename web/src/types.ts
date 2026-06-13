import type { Timestamp } from 'firebase/firestore'

export interface AppUser {
  uid: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'photographer'
  status: 'active' | 'awaiting' | 'suspended'
  areaPermissions?: Record<string, string>
}

export interface Board {
  id: string
  name: string
  color: string
  type: 'planner' | 'trips' | 'vacations' | 'custom'
  order: number
}

export interface Task {
  id: string
  boardId: string
  title: string
  clientId: string
  status: 'todo' | 'inprogress' | 'review' | 'done'
  priority: 'normal' | 'high'
  assignees: string[]
  bucket: string
  dateStart: Timestamp | null
  dateEnd: Timestamp | null
  notes: string
  completed: boolean
  createdBy: string
  createdAt: Timestamp
}

export interface Client {
  id: string
  name: string
  active: boolean
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
