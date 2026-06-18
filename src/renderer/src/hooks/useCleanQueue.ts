// useCleanQueue.ts — small concurrency-limited job queue for the Photo Manager
// auto-clean (single-photo background removal). Keeps the heavy engine from being
// hit by 30 simultaneous torch processes: runs `concurrency` jobs at a time and
// exposes per-job status so the UI can show progress.

import { useCallback, useRef, useState } from 'react'

export type CleanJobStatus = 'queued' | 'running' | 'done' | 'error'

export interface CleanJob {
  id: string                 // unique key, e.g. `${recipeUid}/${filename}`
  label: string              // human label for error messages
  run: () => Promise<void>   // does the actual work; throws on failure
}

export interface CleanQueue {
  status: Record<string, CleanJobStatus>
  activeCount: number
  pendingCount: number
  errors: { id: string; label: string; message: string }[]
  enqueue: (job: CleanJob) => void
  cancelAll: () => void
  clearErrors: () => void
}

export function useCleanQueue(concurrency = 1): CleanQueue {
  const [status, setStatus] = useState<Record<string, CleanJobStatus>>({})
  const [activeCount, setActiveCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [errors, setErrors] = useState<{ id: string; label: string; message: string }[]>([])

  const queueRef = useRef<CleanJob[]>([])
  const runningRef = useRef(0)
  const cancelledRef = useRef(false)
  const knownRef = useRef<Set<string>>(new Set())

  const pump = useCallback(() => {
    while (runningRef.current < concurrency && queueRef.current.length > 0) {
      const job = queueRef.current.shift()!
      setPendingCount(queueRef.current.length)
      if (cancelledRef.current) continue
      runningRef.current += 1
      setActiveCount(runningRef.current)
      setStatus((s) => ({ ...s, [job.id]: 'running' }))
      job.run()
        .then(() => setStatus((s) => ({ ...s, [job.id]: 'done' })))
        .catch((e: unknown) => {
          setStatus((s) => ({ ...s, [job.id]: 'error' }))
          setErrors((errs) => [...errs, { id: job.id, label: job.label, message: (e as Error)?.message || 'Cut-out failed.' }])
        })
        .finally(() => {
          runningRef.current -= 1
          setActiveCount(runningRef.current)
          knownRef.current.delete(job.id)
          pump()
        })
    }
  }, [concurrency])

  const enqueue = useCallback((job: CleanJob) => {
    if (knownRef.current.has(job.id)) return // already queued/running
    knownRef.current.add(job.id)
    cancelledRef.current = false
    queueRef.current.push(job)
    setPendingCount(queueRef.current.length)
    setStatus((s) => ({ ...s, [job.id]: 'queued' }))
    pump()
  }, [pump])

  const cancelAll = useCallback(() => {
    cancelledRef.current = true
    queueRef.current = []
    knownRef.current.clear()
    setPendingCount(0)
    void window.electronAPI.bgRemovalCleanCancelAll()
  }, [])

  const clearErrors = useCallback(() => setErrors([]), [])

  return { status, activeCount, pendingCount, errors, enqueue, cancelAll, clearErrors }
}
