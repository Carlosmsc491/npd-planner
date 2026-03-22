// src/renderer/src/components/settings/TrashPanel.tsx
// Trash queue panel for viewing and restoring deleted tasks

import { useEffect, useState } from 'react'
import { Trash2, RefreshCw, AlertTriangle, Calendar, HardDrive } from 'lucide-react'
import { subscribeToTrashQueue, restoreTaskFromTrash, updateTrashItemStatus } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { useTaskStore } from '../../store/taskStore'
import { formatRelativeTime } from '../../utils/dateUtils'
import type { TrashQueueItem } from '../../types'

export default function TrashPanel() {
  const { user } = useAuthStore()
  const { setToast } = useTaskStore()
  const [items, setItems] = useState<TrashQueueItem[]>([])
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const unsub = subscribeToTrashQueue(setItems)
    return unsub
  }, [])

  async function handleRestore(item: TrashQueueItem) {
    if (!user) return
    setIsLoading(prev => ({ ...prev, [item.id]: true }))
    
    try {
      await restoreTaskFromTrash(item.id)
      setToast({
        message: `Restored: ${item.taskTitle}`,
        type: 'success',
        id: Date.now().toString(),
      })
    } catch (err) {
      console.error('Failed to restore task:', err)
      setToast({
        message: 'Failed to restore task',
        type: 'error',
        id: Date.now().toString(),
      })
    } finally {
      setIsLoading(prev => ({ ...prev, [item.id]: false }))
    }
  }

  async function handleDeleteNow(item: TrashQueueItem) {
    if (!user) return
    
    const confirmed = confirm(
      `Permanently delete "${item.taskTitle}"?\n\nThis will delete the folder and all files in SharePoint. This action cannot be undone.`
    )
    
    if (!confirmed) return
    
    setIsLoading(prev => ({ ...prev, [item.id]: true }))
    
    try {
      // Delete folder in SharePoint
      const result = await window.electronAPI.deleteTrashFolder(item.sharePointFolderPath)
      
      if (result.success) {
        // Update status in Firestore
        await updateTrashItemStatus(item.id, 'deleted')
        setToast({
          message: `Permanently deleted: ${item.taskTitle}`,
          type: 'success',
          id: Date.now().toString(),
        })
      } else {
        throw new Error(result.error || 'Failed to delete folder')
      }
    } catch (err) {
      console.error('Failed to delete folder:', err)
      setToast({
        message: 'Failed to delete folder',
        type: 'error',
        id: Date.now().toString(),
      })
    } finally {
      setIsLoading(prev => ({ ...prev, [item.id]: false }))
    }
  }

  const getDaysRemaining = (scheduledDeleteAt: { toDate: () => Date }) => {
    const now = new Date()
    const scheduled = scheduledDeleteAt.toDate()
    const diffMs = scheduled.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <Trash2 className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Trash is empty</h3>
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Deleted tasks will appear here. They will be automatically deleted after the retention period.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Automatic Deletion
            </h4>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              Items in trash will be permanently deleted after the retention period. 
              You can restore them or delete them immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {items.map((item) => {
          const daysRemaining = getDaysRemaining(item.scheduledDeleteAt)
          const isItemLoading = isLoading[item.id]

          return (
            <div
              key={item.id}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {item.taskTitle}
                  </h4>
                  
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3.5 w-3.5" />
                      {item.boardName || 'Unknown board'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Deleted {formatRelativeTime(item.deletedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      by {item.deletedByName}
                    </span>
                  </div>

                  {/* Attachments */}
                  {item.attachments.length > 0 && (
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      {item.attachments.length} attachment{item.attachments.length !== 1 ? 's' : ''}
                    </p>
                  )}

                  {/* Days remaining */}
                  <div className="mt-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      daysRemaining <= 3
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : daysRemaining <= 7
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {daysRemaining === 0 
                        ? 'Deleting soon' 
                        : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    onClick={() => handleRestore(item)}
                    disabled={isItemLoading}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isItemLoading ? 'animate-spin' : ''}`} />
                    Restore
                  </button>
                  <button
                    onClick={() => handleDeleteNow(item)}
                    disabled={isItemLoading}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Now
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
