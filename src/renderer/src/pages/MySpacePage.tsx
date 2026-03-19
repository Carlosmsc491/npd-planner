import { useState, useMemo, useCallback } from 'react'
import AppLayout from '../components/ui/AppLayout'
import PersonalNotes from '../components/myspace/PersonalNotes'
import PersonalTasks from '../components/myspace/PersonalTasks'
import PersonalCalendar from '../components/myspace/PersonalCalendar'
import QuickLinks from '../components/myspace/QuickLinks'
import TaskPage from '../components/task/TaskPage'
import { useMySpace } from '../hooks/useMySpace'
import { useMyTasks } from '../hooks/useMyTasks'
import { useBoardStore } from '../store/boardStore'
import { useAuthStore } from '../store/authStore'
import { User, Lock } from 'lucide-react'
import type { Task } from '../types'
import { Timestamp } from 'firebase/firestore'

export default function MySpacePage() {
  const { user } = useAuthStore()
  const { boards } = useBoardStore()
  const { tasks: boardTasks } = useMyTasks()
  
  const {
    // Notes
    notesContent,
    setNotesContent,
    saveNotes,
    notesSaving,
    notesSaved,
    // Tasks
    tasks: personalTasks,
    completedTasks,
    activeTasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskComplete,
    // Links
    links,
    addLink,
    deleteLink,
  } = useMySpace()

  const [selectedBoardTask, setSelectedBoardTask] = useState<Task | null>(null)

  // Get assigned tasks for calendar (only assigned to me)
  const myBoardTasks = useMemo(() => {
    if (!user) return []
    return boardTasks.filter((task) => task.assignees.includes(user.uid))
  }, [boardTasks, user])

  const handleBoardTaskClick = (task: Task) => {
    setSelectedBoardTask(task)
  }

  const handleUpdatePersonalTask = useCallback(async (taskId: string, title: string, dueDate: Date | null) => {
    await updateTask(taskId, { 
      title, 
      dueDate: dueDate ? Timestamp.fromDate(dueDate) : null 
    })
  }, [updateTask])

  const getBoardForTask = (task: Task) => {
    return boards.find((b) => b.id === task.boardId)
  }

  return (
    <AppLayout>
      <div className="p-6 w-full max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <User className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                My Space
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your personal workspace — only you can see this
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs font-medium">
              <Lock size={12} />
              Private
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column (60% on large screens) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Personal Notes */}
            <div className="h-[400px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
              <PersonalNotes
                content={notesContent}
                onChange={setNotesContent}
                onSave={saveNotes}
                saving={notesSaving}
                saved={notesSaved}
              />
            </div>

            {/* Personal Tasks */}
            <div className="h-[400px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
              <PersonalTasks
                tasks={activeTasks}
                completedTasks={completedTasks}
                onAddTask={addTask}
                onToggleComplete={toggleTaskComplete}
                onDeleteTask={deleteTask}
                onUpdateTask={handleUpdatePersonalTask}
              />
            </div>
          </div>

          {/* Right Column (40% on large screens) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Calendar */}
            <div className="h-[400px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
              <PersonalCalendar
                boardTasks={myBoardTasks}
                personalTasks={personalTasks}
                boards={boards}
                onBoardTaskClick={handleBoardTaskClick}
                onPersonalTaskClick={() => {}}
              />
            </div>

            {/* Quick Links */}
            <div className="h-[400px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
              <QuickLinks
                links={links}
                onAddLink={addLink}
                onDeleteLink={deleteLink}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Task Page Modal for Board Tasks */}
      {selectedBoardTask && user && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelectedBoardTask(null)}
          />
          <div className="fixed inset-4 md:inset-10 lg:inset-16 z-50 rounded-2xl overflow-hidden shadow-2xl">
            <TaskPage
              task={selectedBoardTask}
              board={getBoardForTask(selectedBoardTask) || null}
              users={[]}
              onClose={() => setSelectedBoardTask(null)}
              onDelete={() => setSelectedBoardTask(null)}
              onRecurring={() => {}}
              onDuplicate={() => {}}
            />
          </div>
        </>
      )}
    </AppLayout>
  )
}
