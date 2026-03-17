import { create } from 'zustand'
import type { Task, ToastData, ConflictData } from '../types'

interface TaskState {
  tasks: Task[]
  selectedTask: Task | null
  toast: ToastData | null
  conflict: ConflictData | null
  setTasks: (tasks: Task[]) => void
  setSelectedTask: (task: Task | null) => void
  setToast: (toast: ToastData | null) => void
  setConflict: (conflict: ConflictData | null) => void
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  selectedTask: null,
  toast: null,
  conflict: null,
  setTasks: (tasks) => set({ tasks }),
  setSelectedTask: (selectedTask) => set({ selectedTask }),
  setToast: (toast) => set({ toast }),
  setConflict: (conflict) => set({ conflict }),
}))
