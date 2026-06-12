// src/renderer/src/lib/teamsFirestore.ts
// Firestore operations for the multi-team platform (teams + memberships).
// Team isolation is enforced server-side by firestore.rules — these helpers
// assume the caller already passed the canManageTeams/canViewTeam checks.

import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Team, TeamMember, TeamRole } from '../types'

export const TEAM_COLLECTIONS = {
  TEAMS:        'teams',
  TEAM_MEMBERS: 'teamMembers',
} as const

// Deterministic membership id — lets security rules do exists() lookups
// (`/teamMembers/{teamId_uid}`) without a query.
export function teamMemberId(teamId: string, uid: string): string {
  return `${teamId}_${uid}`
}

// ─────────────────────────────────────────
// TEAMS
// ─────────────────────────────────────────

export async function createTeam(name: string, clientId: string | null, createdBy: string): Promise<string> {
  try {
    const ref = await addDoc(collection(db, TEAM_COLLECTIONS.TEAMS), {
      name,
      clientId,
      active: true,
      createdBy,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create team: ${err}`)
  }
}

export async function updateTeam(teamId: string, changes: Partial<Pick<Team, 'name' | 'clientId' | 'active'>>): Promise<void> {
  try {
    await updateDoc(doc(db, TEAM_COLLECTIONS.TEAMS, teamId), changes)
  } catch (err) {
    throw new Error(`Failed to update team: ${err}`)
  }
}

/** Deletes the team and all its memberships (batched). */
export async function deleteTeam(teamId: string): Promise<void> {
  try {
    const members = await getDocs(
      query(collection(db, TEAM_COLLECTIONS.TEAM_MEMBERS), where('teamId', '==', teamId))
    )
    const batch = writeBatch(db)
    members.docs.forEach((d) => batch.delete(d.ref))
    batch.delete(doc(db, TEAM_COLLECTIONS.TEAMS, teamId))
    await batch.commit()
  } catch (err) {
    throw new Error(`Failed to delete team: ${err}`)
  }
}

/** Admin view: all teams. Single scoped listener (free-tier quota). */
export function subscribeToTeams(callback: (teams: Team[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, TEAM_COLLECTIONS.TEAMS), orderBy('name')),
    (snap) => callback(snap.docs.map((d) => ({ ...(d.data() as Omit<Team, 'id'>), id: d.id }))),
    (err) => console.error('subscribeToTeams error:', err)
  )
}

// ─────────────────────────────────────────
// MEMBERSHIPS
// ─────────────────────────────────────────

export async function addTeamMember(
  teamId: string,
  uid: string,
  teamRole: TeamRole,
  addedBy: string
): Promise<void> {
  try {
    const id = teamMemberId(teamId, uid)
    await setDoc(doc(db, TEAM_COLLECTIONS.TEAM_MEMBERS, id), {
      id,
      teamId,
      uid,
      teamRole,
      addedBy,
      addedAt: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Failed to add team member: ${err}`)
  }
}

export async function updateTeamMemberRole(teamId: string, uid: string, teamRole: TeamRole): Promise<void> {
  try {
    await updateDoc(doc(db, TEAM_COLLECTIONS.TEAM_MEMBERS, teamMemberId(teamId, uid)), { teamRole })
  } catch (err) {
    throw new Error(`Failed to update team member role: ${err}`)
  }
}

export async function removeTeamMember(teamId: string, uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, TEAM_COLLECTIONS.TEAM_MEMBERS, teamMemberId(teamId, uid)))
  } catch (err) {
    throw new Error(`Failed to remove team member: ${err}`)
  }
}

/** Admin view: every membership across teams. Single listener. */
export function subscribeToAllTeamMembers(callback: (members: TeamMember[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, TEAM_COLLECTIONS.TEAM_MEMBERS),
    (snap) => callback(snap.docs.map((d) => d.data() as TeamMember)),
    (err) => console.error('subscribeToAllTeamMembers error:', err)
  )
}

/** Member view: only the caller's own memberships (rules-provable query). */
export function subscribeToMyMemberships(
  uid: string,
  callback: (members: TeamMember[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, TEAM_COLLECTIONS.TEAM_MEMBERS), where('uid', '==', uid)),
    (snap) => callback(snap.docs.map((d) => d.data() as TeamMember)),
    (err) => console.error('subscribeToMyMemberships error:', err)
  )
}
