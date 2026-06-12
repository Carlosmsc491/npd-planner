// src/renderer/src/store/teamStore.ts
// Zustand store for the multi-team platform. Firestore reads live HERE,
// never in components (project rule). The TeamsPanel calls initAdmin()
// and keeps the returned cleanup for unmount.

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  subscribeToTeams,
  subscribeToAllTeamMembers,
  subscribeToMyMemberships,
} from '../lib/teamsFirestore'
import type { Team, TeamMember } from '../types'

interface TeamState {
  teams: Team[]
  members: TeamMember[]        // admin view: all memberships
  myMemberships: TeamMember[]  // member view: the signed-in user's memberships
  isLoaded: boolean
  /** Admin/owner: live teams + all memberships. Returns cleanup. */
  initAdmin: () => () => void
  /** Any user: live own memberships only (scoped query). Returns cleanup. */
  initMyMemberships: (uid: string) => () => void
}

export const useTeamStore = create<TeamState>()(
  subscribeWithSelector((set) => ({
    teams: [],
    members: [],
    myMemberships: [],
    isLoaded: false,

    initAdmin: () => {
      const unsubTeams = subscribeToTeams((teams) => set({ teams, isLoaded: true }))
      const unsubMembers = subscribeToAllTeamMembers((members) => set({ members }))
      return () => {
        unsubTeams()
        unsubMembers()
        set({ teams: [], members: [], isLoaded: false })
      }
    },

    initMyMemberships: (uid: string) => {
      const unsub = subscribeToMyMemberships(uid, (myMemberships) => set({ myMemberships }))
      return () => {
        unsub()
        set({ myMemberships: [] })
      }
    },
  }))
)
