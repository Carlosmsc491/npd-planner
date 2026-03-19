import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  subscribeToPersonalNotes,
  updatePersonalNotes,
  subscribeToPersonalTasks,
  createPersonalTask,
  updatePersonalTask,
  deletePersonalTask,
  togglePersonalTaskComplete,
  subscribeToQuickLinks,
  createQuickLink,
  deleteQuickLink,
} from '../lib/firestore'
import { useAuthStore } from '../store/authStore'
import type { PersonalNote, PersonalTask, QuickLink } from '../types'

interface UseMySpaceReturn {
  // Notes
  notes: PersonalNote | null
  notesContent: string
  setNotesContent: (content: string) => void
  saveNotes: () => Promise<void>
  notesSaving: boolean
  notesSaved: boolean

  // Tasks
  tasks: PersonalTask[]
  completedTasks: PersonalTask[]
  activeTasks: PersonalTask[]
  addTask: (title: string, dueDate: Date | null) => Promise<void>
  updateTask: (taskId: string, data: Partial<PersonalTask>) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  toggleTaskComplete: (taskId: string, completed: boolean) => Promise<void>

  // Quick Links
  links: QuickLink[]
  addLink: (title: string, url: string, icon: string) => Promise<void>
  deleteLink: (linkId: string) => Promise<void>

  // Loading states
  loading: boolean
}

const DEBOUNCE_MS = 500
const AUTO_SAVE_INTERVAL_MS = 30000

export function useMySpace(): UseMySpaceReturn {
  const { user } = useAuthStore()

  // Notes state
  const [notes, setNotes] = useState<PersonalNote | null>(null)
  const [notesContent, setNotesContent] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  // Tasks state
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  // Quick links state
  const [links, setLinks] = useState<QuickLink[]>([])
  const [linksLoading, setLinksLoading] = useState(true)

  // Refs for debounce and auto-save
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSavedContentRef = useRef('')

  // ─────────────────────────────────────────
  // Notes Subscription
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setNotes(null)
      setNotesContent('')
      return
    }

    const unsub = subscribeToPersonalNotes(user.uid, (fetchedNotes) => {
      setNotes(fetchedNotes)
      if (fetchedNotes) {
        setNotesContent(fetchedNotes.content)
        lastSavedContentRef.current = fetchedNotes.content
      }
    })

    return unsub
  }, [user])

  // ─────────────────────────────────────────
  // Notes Auto-save (debounce + interval)
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return

    // Clear previous timers
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current)
    }

    // Debounced save
    if (notesContent !== lastSavedContentRef.current) {
      debounceRef.current = setTimeout(() => {
        void saveNotesInternal()
      }, DEBOUNCE_MS)
    }

    // Auto-save interval (every 30 seconds)
    autoSaveRef.current = setInterval(() => {
      if (notesContent !== lastSavedContentRef.current) {
        void saveNotesInternal()
      }
    }, AUTO_SAVE_INTERVAL_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current)
      }
    }
  }, [user, notesContent])

  // Internal save function
  const saveNotesInternal = useCallback(async (): Promise<void> => {
    if (!user || notesContent === lastSavedContentRef.current) return

    setNotesSaving(true)
    setNotesSaved(false)

    try {
      await updatePersonalNotes(user.uid, notesContent)
      lastSavedContentRef.current = notesContent
      setNotesSaved(true)

      // Clear "saved" indicator after 2 seconds
      setTimeout(() => {
        setNotesSaved(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to save notes:', error)
    } finally {
      setNotesSaving(false)
    }
  }, [user, notesContent])

  // Public save function
  const saveNotes = useCallback(async (): Promise<void> => {
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    await saveNotesInternal()
  }, [saveNotesInternal])

  // ─────────────────────────────────────────
  // Tasks Subscription
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setTasks([])
      setTasksLoading(false)
      return
    }

    setTasksLoading(true)
    const unsub = subscribeToPersonalTasks(user.uid, (fetchedTasks) => {
      setTasks(fetchedTasks)
      setTasksLoading(false)
    })

    return unsub
  }, [user])

  // Separate active and completed tasks
  const { activeTasks, completedTasks } = useMemo(() => {
    const active: PersonalTask[] = []
    const completed: PersonalTask[] = []

    tasks.forEach((task) => {
      if (task.completed) {
        completed.push(task)
      } else {
        active.push(task)
      }
    })

    return { activeTasks: active, completedTasks: completed }
  }, [tasks])

  // Task actions
  const addTask = useCallback(
    async (title: string, dueDate: Date | null): Promise<void> => {
      if (!user) return

      try {
        await createPersonalTask(user.uid, {
          title,
          dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
          completed: false,
          completedAt: null,
        })
      } catch (error) {
        console.error('Failed to create personal task:', error)
        throw error
      }
    },
    [user]
  )

  const updateTask = useCallback(
    async (taskId: string, data: Partial<PersonalTask>): Promise<void> => {
      if (!user) return

      try {
        await updatePersonalTask(user.uid, taskId, data)
      } catch (error) {
        console.error('Failed to update personal task:', error)
        throw error
      }
    },
    [user]
  )

  const deleteTask = useCallback(
    async (taskId: string): Promise<void> => {
      if (!user) return

      try {
        await deletePersonalTask(user.uid, taskId)
      } catch (error) {
        console.error('Failed to delete personal task:', error)
        throw error
      }
    },
    [user]
  )

  const toggleTaskComplete = useCallback(
    async (taskId: string, completed: boolean): Promise<void> => {
      if (!user) return

      try {
        await togglePersonalTaskComplete(user.uid, taskId, completed)
      } catch (error) {
        console.error('Failed to toggle task completion:', error)
        throw error
      }
    },
    [user]
  )

  // ─────────────────────────────────────────
  // Quick Links Subscription
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setLinks([])
      setLinksLoading(false)
      return
    }

    setLinksLoading(true)
    const unsub = subscribeToQuickLinks(user.uid, (fetchedLinks) => {
      setLinks(fetchedLinks)
      setLinksLoading(false)
    })

    return unsub
  }, [user])

  // Quick link actions
  const addLink = useCallback(
    async (title: string, url: string, icon: string): Promise<void> => {
      if (!user) return

      try {
        await createQuickLink(user.uid, { title, url, icon })
      } catch (error) {
        console.error('Failed to create quick link:', error)
        throw error
      }
    },
    [user]
  )

  const deleteLink = useCallback(
    async (linkId: string): Promise<void> => {
      if (!user) return

      try {
        await deleteQuickLink(user.uid, linkId)
      } catch (error) {
        console.error('Failed to delete quick link:', error)
        throw error
      }
    },
    [user]
  )

  // Overall loading state
  const loading = tasksLoading || linksLoading

  return {
    // Notes
    notes,
    notesContent,
    setNotesContent,
    saveNotes,
    notesSaving,
    notesSaved,

    // Tasks
    tasks,
    completedTasks,
    activeTasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskComplete,

    // Quick Links
    links,
    addLink,
    deleteLink,

    // Loading states
    loading,
  }
}
