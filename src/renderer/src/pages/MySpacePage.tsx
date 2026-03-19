import { useState, useMemo, useCallback } from 'react'
import AppLayout from '../components/ui/AppLayout'
import PersonalTasks from '../components/myspace/PersonalTasks'
import PersonalCalendar from '../components/myspace/PersonalCalendar'
import QuickLinks from '../components/myspace/QuickLinks'
import TaskPage from '../components/task/TaskPage'
import { useMySpace } from '../hooks/useMySpace'
import { useMyTasks } from '../hooks/useMyTasks'
import { useBoardStore } from '../store/boardStore'
import { useAuthStore } from '../store/authStore'
import type { Task } from '../types'
import { Timestamp } from 'firebase/firestore'

export default function MySpacePage() {
  const { user } = useAuthStore()
  const { boards } = useBoardStore()
  const { tasks: boardTasks } = useMyTasks()
  
  const {
    // Notes (keep subscription alive even though we don't render it)
    // @ts-ignore - intentionally unused but needed for subscription
    notesContent,
    // @ts-ignore
    setNotesContent,
    // @ts-ignore
    saveNotes,
    // @ts-ignore
    notesSaving,
    // @ts-ignore
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
  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar' | 'links'>('tasks')

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
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header con título y tabs al lado */}
        <div className="flex-shrink-0 flex items-center gap-6 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">My Space</h1>
          
          {/* Tabs al lado del título, estilo pills */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(
              [
                { id: 'tasks', label: 'My Tasks' },
                { id: 'calendar', label: 'My Calendar' },
                { id: 'links', label: 'Quick Links' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'tasks' && (
            <div className="h-full overflow-y-auto p-6">
              <PersonalTasks
                tasks={activeTasks}
                completedTasks={completedTasks}
                onAddTask={addTask}
                onToggleComplete={toggleTaskComplete}
                onDeleteTask={deleteTask}
                onUpdateTask={handleUpdatePersonalTask}
              />
            </div>
          )}
          {activeTab === 'calendar' && (
            <div className="h-full overflow-hidden">
              <PersonalCalendar
                boardTasks={myBoardTasks}
                personalTasks={personalTasks}
                boards={boards}
                onBoardTaskClick={handleBoardTaskClick}
                onPersonalTaskClick={() => {}}
              />
            </div>
          )}
          {activeTab === 'links' && (
            <div className="h-full overflow-y-auto p-6">
              <QuickLinks
                links={links}
                onAddLink={addLink}
                onDeleteLink={deleteLink}
              />
            </div>
          )}
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
      </div>
    </AppLayout>
  )
}
