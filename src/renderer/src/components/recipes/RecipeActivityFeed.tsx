// src/renderer/src/components/recipes/RecipeActivityFeed.tsx
// Real-time activity feed derived from recipe file state changes

import { useEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import type { RecipeFile } from '../../types'
import { Timestamp } from 'firebase/firestore'

interface ActivityEntry {
  id: string
  message: string
  timestamp: Date
}

interface Props {
  files: RecipeFile[]
}

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 5)   return 'just now'
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toLocaleDateString()
}

function tsToDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null
  try {
    return ts instanceof Timestamp ? ts.toDate() : new Date((ts as { seconds: number }).seconds * 1000)
  } catch {
    return null
  }
}

export default function RecipeActivityFeed({ files }: Props) {
  const [feed, setFeed] = useState<ActivityEntry[]>([])
  const prevFilesRef = useRef<Map<string, RecipeFile>>(new Map())
  const [, setTick] = useState(0)

  // Re-render timestamps every 30 s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Detect file state transitions and add activity entries
  useEffect(() => {
    const prev = prevFilesRef.current
    const newEntries: ActivityEntry[] = []

    for (const file of files) {
      const old = prev.get(file.id)

      if (!old && file.status !== 'pending') {
        // New file detected with a non-pending status
        continue
      }

      if (old) {
        // Claimed
        if (old.status !== 'in_progress' && file.status === 'in_progress' && file.lockedBy) {
          newEntries.push({
            id:        `${file.id}-claim-${Date.now()}`,
            message:   `${file.lockedBy} claimed ${file.displayName}`,
            timestamp: tsToDate(file.lockClaimedAt) ?? new Date(),
          })
        }

        // Marked done
        if (old.status !== 'done' && file.status === 'done' && file.doneBy) {
          newEntries.push({
            id:        `${file.id}-done-${Date.now()}`,
            message:   `${file.doneBy} finished ${file.displayName}`,
            timestamp: tsToDate(file.doneAt) ?? new Date(),
          })
        }

        // Reopened
        if (old.status === 'done' && file.status === 'pending') {
          newEntries.push({
            id:        `${file.id}-reopen-${Date.now()}`,
            message:   `${file.displayName} was reopened`,
            timestamp: new Date(),
          })
        }

        // Lock expired
        if (old.status === 'in_progress' && file.status === 'lock_expired') {
          newEntries.push({
            id:        `${file.id}-expired-${Date.now()}`,
            message:   `Lock expired on ${file.displayName}`,
            timestamp: new Date(),
          })
        }
      }
    }

    // Update ref snapshot
    prevFilesRef.current = new Map(files.map((f) => [f.id, f]))

    if (newEntries.length > 0) {
      setFeed((prev) =>
        [...newEntries, ...prev].slice(0, 20)
      )
    }
  }, [files])

  if (feed.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <Activity size={18} className="mx-auto text-gray-300 dark:text-gray-600 mb-1" />
        <p className="text-xs text-gray-400 dark:text-gray-500">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {feed.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2 px-3 py-1.5">
          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-tight">{entry.message}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {relativeTime(entry.timestamp)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
