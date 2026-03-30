// src/hooks/useHistoricalTasks.ts
// Hook for fetching and managing historical task data

import { useState, useEffect, useCallback } from 'react'
import type { HistoricalTask, ImportBatch } from '../types'
import { getHistoricalTasks, getImportBatches, deleteImportBatch } from '../lib/firestore'

interface UseHistoricalTasksOptions {
  year?: number
  clientId?: string
  importBatchId?: string
}

export function useHistoricalTasks(options: UseHistoricalTasksOptions = {}) {
  const [tasks, setTasks] = useState<HistoricalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getHistoricalTasks(options)
      setTasks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch historical tasks')
    } finally {
      setLoading(false)
    }
  }, [options.year, options.clientId, options.importBatchId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  return { tasks, loading, error, refetch: fetchTasks }
}

export function useImportBatches() {
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getImportBatches()
      setBatches(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch import batches')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  const deleteBatch = useCallback(async (batchId: string) => {
    try {
      await deleteImportBatch(batchId)
      // Refresh the list
      await fetchBatches()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete batch')
      return false
    }
  }, [fetchBatches])

  return { batches, loading, error, refetch: fetchBatches, deleteBatch }
}

/**
 * Calculate aggregated statistics from historical tasks
 */
export function useHistoricalStats(tasks: HistoricalTask[]) {
  return {
    totalTasks: tasks.length,
    uniqueClients: new Set(tasks.map(t => t.clientId)).size,
    uniqueBuckets: new Set(tasks.map(t => t.bucket)).size,
    uniqueAssignees: new Set(tasks.flatMap(t => t.assigneeNames)).size,
    
    // Tasks by month for charting
    tasksByMonth: Array.from({ length: 12 }, (_, i) => {
      const monthTasks = tasks.filter(t => t.month === i + 1)
      return {
        month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
        count: monthTasks.length,
        tasks: monthTasks,
      }
    }),
    
    // Tasks by bucket for charting
    tasksByBucket: Object.entries(
      tasks.reduce((acc, t) => {
        acc[t.bucket] = (acc[t.bucket] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    ).map(([name, count]) => ({ name, count })),
    
    // Tasks by client for charting
    tasksByClient: Object.entries(
      tasks.reduce((acc, t) => {
        acc[t.clientName] = (acc[t.clientName] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    )
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    
    // Tasks by assignee for charting
    tasksByAssignee: Object.entries(
      tasks.reduce((acc, t) => {
        t.assigneeNames.forEach(name => {
          acc[name] = (acc[name] || 0) + 1
        })
        return acc
      }, {} as Record<string, number>)
    )
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  }
}
