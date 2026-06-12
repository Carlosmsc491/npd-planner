// src/renderer/src/store/requestStore.ts
// Zustand store for sample requests. Firestore reads live HERE (project rule).
// Admins get one all-requests listener; members get two scoped listeners
// (created-by-me + assigned-to-me) merged into a single deduped list.

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  subscribeToAllRequests,
  subscribeToMyRequests,
  subscribeToAssignedRequests,
} from '../lib/requestsFirestore'
import type { SampleRequest } from '../types'

function mergeDedupe(a: SampleRequest[], b: SampleRequest[]): SampleRequest[] {
  const seen = new Set<string>()
  const merged: SampleRequest[] = []
  for (const r of [...a, ...b]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    merged.push(r)
  }
  return merged.sort((x, y) => (y.createdAt?.toMillis?.() ?? 0) - (x.createdAt?.toMillis?.() ?? 0))
}

interface RequestState {
  requests: SampleRequest[]
  isLoaded: boolean
  /** NPD admin/owner: every request. Returns cleanup. */
  initAdmin: () => () => void
  /** Team member: my requests + assigned to me. Returns cleanup. */
  initMember: (uid: string) => () => void
}

export const useRequestStore = create<RequestState>()(
  subscribeWithSelector((set) => ({
    requests: [],
    isLoaded: false,

    initAdmin: () => {
      const unsub = subscribeToAllRequests((requests) => set({ requests, isLoaded: true }))
      return () => {
        unsub()
        set({ requests: [], isLoaded: false })
      }
    },

    initMember: (uid: string) => {
      let mine: SampleRequest[] = []
      let assigned: SampleRequest[] = []
      const push = () => set({ requests: mergeDedupe(mine, assigned), isLoaded: true })
      const unsubMine = subscribeToMyRequests(uid, (reqs) => { mine = reqs; push() })
      const unsubAssigned = subscribeToAssignedRequests(uid, (reqs) => { assigned = reqs; push() })
      return () => {
        unsubMine()
        unsubAssigned()
        set({ requests: [], isLoaded: false })
      }
    },
  }))
)
