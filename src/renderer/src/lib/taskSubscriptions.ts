// src/renderer/src/lib/taskSubscriptions.ts
// Shared, long-lived task listeners — one Firestore subscription per board.
//
// Why this exists: tearing down a board's onSnapshot on navigation and
// immediately re-creating the identical query (Dashboard → BoardPage) left the
// new listener stalled for minutes while the watch stream re-established
// (measured: 95 cached docs delivered in 24ms to the first listener, then a
// 3-minute silence for the re-subscription). Keeping one listener per board
// alive for the session removes the churn entirely, makes navigation instant,
// and halves Firestore reads since Dashboard and BoardPage now share streams.
// Listeners stay tightly scoped (one per board — bounded by board count).

import { subscribeToTasks } from './firestore'
import type { Task } from '../types'

interface BoardSubscription {
  unsub: () => void
  listeners: Set<(tasks: Task[]) => void>
  last: Task[] | null
}

const subscriptions = new Map<string, BoardSubscription>()

/**
 * Listen to a board's tasks through the shared subscription.
 * The returned cleanup detaches THIS consumer only — the underlying Firestore
 * listener stays alive for the session (see releaseAllTaskListeners).
 * If data already arrived, the callback fires synchronously with it.
 */
export function listenToBoardTasks(
  boardId: string,
  callback: (tasks: Task[]) => void
): () => void {
  let entry = subscriptions.get(boardId)
  if (!entry) {
    const newEntry: BoardSubscription = { unsub: () => {}, listeners: new Set(), last: null }
    subscriptions.set(boardId, newEntry)
    newEntry.unsub = subscribeToTasks(boardId, (tasks) => {
      newEntry.last = tasks
      newEntry.listeners.forEach((l) => l(tasks))
    })
    entry = newEntry
  }
  entry.listeners.add(callback)
  if (entry.last) callback(entry.last)
  return () => { entry.listeners.delete(callback) }
}

/** Tear everything down — call on sign-out (rules reject unauthenticated reads). */
export function releaseAllTaskListeners(): void {
  for (const entry of subscriptions.values()) entry.unsub()
  subscriptions.clear()
}

// Dev HMR: when this module is hot-replaced its Map resets, but the OLD
// Firestore listeners would keep running forever — every edit during a dev
// session stacked another set of live listeners (memory + quota leak).
// Production builds strip this block.
if (import.meta.hot) {
  import.meta.hot.dispose(() => releaseAllTaskListeners())
}
