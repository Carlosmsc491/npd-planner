import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Task, ToastData, ConflictData } from '../types'
import { showToastData } from '../lib/toast'

interface TaskState {
  tasks: Task[]
  selectedTask: Task | null
  conflict: ConflictData | null
  setTasks: (tasks: Task[]) => void
  setSelectedTask: (task: Task | null) => void
  /** Show a transient toast. Kept for backward compatibility — forwards to the
   *  shared sileo-backed toast so every existing call site renders globally. */
  setToast: (toast: ToastData | null) => void
  setConflict: (conflict: ConflictData | null) => void
}

export const useTaskStore = create<TaskState>()(
  subscribeWithSelector((set) => ({
    tasks: [],
    selectedTask: null,
    conflict: null,
    setTasks: (tasks) => set({ tasks }),
    setSelectedTask: (selectedTask) => set({ selectedTask }),
    setToast: (toast) => showToastData(toast),
    setConflict: (conflict) => set({ conflict }),
  }))
)
