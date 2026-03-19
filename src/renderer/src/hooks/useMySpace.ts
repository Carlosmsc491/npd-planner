import { useEffect, useState, useCallback, useRef } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  subscribeToPersonalNotes,
  subscribeToPersonalTasks,
  subscribeToQuickLinks,
  updatePersonalNotes,
  createPersonalTask,
  updatePersonalTask,
  deletePersonalTask,
  togglePersonalTaskComplete,
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
  saveStatus: 'saved' | 'saving' | 'unsaved'
  saveNotes: () => Promise<void>

  // Tasks
  tasks: PersonalTask[]
  addTask: (title: string, dueDate: Date | null) => Promise<void>
  updateTask: (taskId: string, updates: Partial<PersonalTask>) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  toggleTaskComplete: (taskId: string, completed: boolean) => Promise<void>

  // Links
  links: QuickLink[]
  addLink: (title: string, url: string, icon: string) => Promise<void>
  deleteLink: (linkId: string) => Promise<void>

  // Loading states
  loading: {
    notes: boolean
    tasks: boolean
    links: boolean
  }
}

export function useMySpace(): UseMySpaceReturn {
  const { user } = useAuthStore()

  // Notes state
  const [notes, setNotes] = useState<PersonalNote | null>(null)
  const [notesContent, setNotesContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const notesLoading = useRef(true)

  // Tasks state
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  // Links state
  const [links, setLinks] = useState<QuickLink[]>([])
  const [linksLoading, setLinksLoading] = useState(true)

  // Auto-save timeout ref
  const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const periodicSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Subscribe to notes
  useEffect(() => {
    if (!user) {
      setNotes(null)
      setNotesContent('')
      notesLoading.current = false
      return
    }

    notesLoading.current = true
    const unsub = subscribeToPersonalNotes(user.uid, (note) => {
      setNotes(note)
      if (note && notesContent === '') {
        setNotesContent(note.content)
      }
      notesLoading.current = false
      setSaveStatus('saved')
    })

    return unsub
  }, [user])

  // Subscribe to tasks
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

  // Subscribe to links
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

  // Auto-save notes when content changes
  useEffect(() => {
    if (!user || notesContent === notes?.content) return

    setSaveStatus('unsaved')

    // Clear existing timeout
    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current)
    }

    // Debounced save (500ms)
    autoSaveTimeout.current = setTimeout(() => {
      saveNotes()
    }, 500)

    return () => {
      if (autoSaveTimeout.current) {
        clearTimeout(autoSaveTimeout.current)
      }
    }
  }, [notesContent, user])

  // Periodic auto-save every 30 seconds
  useEffect(() => {
    if (!user) return

    periodicSaveInterval.current = setInterval(() => {
      if (saveStatus === 'unsaved') {
        saveNotes()
      }
    }, 30000)

    return () => {
      if (periodicSaveInterval.current) {
        clearInterval(periodicSaveInterval.current)
      }
    }
  }, [user, saveStatus, notesContent])

  // Save notes function
  const saveNotes = useCallback(async () => {
    if (!user) return

    setSaveStatus('saving')
    try {
      await updatePersonalNotes(user.uid, notesContent)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }, [user, notesContent])

  // Task operations
  const addTask = useCallback(
    async (title: string, dueDate: Date | null) => {
      if (!user) return
      const dueTimestamp = dueDate ? Timestamp.fromDate(dueDate) : null
      await createPersonalTask(user.uid, title, dueTimestamp)
    },
    [user]
  )

  const updateTask = useCallback(
    async (taskId: string, updates: Partial<PersonalTask>) => {
      if (!user) return
      await updatePersonalTask(user.uid, taskId, updates)
    },
    [user]
  )

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!user) return
      await deletePersonalTask(user.uid, taskId)
    },
    [user]
  )

  const toggleTaskComplete = useCallback(
    async (taskId: string, completed: boolean) => {
      if (!user) return
      await togglePersonalTaskComplete(user.uid, taskId, completed)
    },
    [user]
  )

  // Link operations
  const addLink = useCallback(
    async (title: string, url: string, icon: string) => {
      if (!user) return
      await createQuickLink(user.uid, title, url, icon)
    },
    [user]
  )

  const deleteLink = useCallback(
    async (linkId: string) => {
      if (!user) return
      await deleteQuickLink(user.uid, linkId)
    },
    [user]
  )

  return {
    notes,
    notesContent,
    setNotesContent,
    saveStatus,
    saveNotes,
    tasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskComplete,
    links,
    addLink,
    deleteLink,
    loading: {
      notes: notesLoading.current,
      tasks: tasksLoading,
      links: linksLoading,
    },
  }
}
