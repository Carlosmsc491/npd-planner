// Unit tests for the governance hierarchy (founder > owner > admin > member)
// and team isolation. Run with: npm run test

import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  isFounder,
  canTransferFounder,
  canChangeRole,
  canAssignRole,
  canManageTeams,
  getTeamRole,
  canViewTeam,
} from '../permissions'
import type { AppUser, TeamMember } from '../../types'

function makeUser(over: Partial<AppUser>): AppUser {
  return {
    uid: 'u-member',
    email: 'user@eliteflower.com',
    name: 'Test User',
    role: 'member',
    status: 'active',
    createdAt: Timestamp.now(),
    lastSeen: Timestamp.now(),
    preferences: {
      theme: 'system',
      dndEnabled: false,
      dndStart: '22:00',
      dndEnd: '08:00',
      shortcuts: {},
      sharePointPath: '',
      calendarView: 'week',
      defaultBoardView: 'cards',
      trashRetentionDays: 30,
    },
    ...over,
  }
}

const FOUNDER_UID = 'u-founder'
const founder = makeUser({ uid: FOUNDER_UID, role: 'owner' })
const owner = makeUser({ uid: 'u-owner', role: 'owner' })
const admin = makeUser({ uid: 'u-admin', role: 'admin' })
const member = makeUser({ uid: 'u-member', role: 'member' })

function membership(teamId: string, uid: string, teamRole: TeamMember['teamRole']): TeamMember {
  return { id: `${teamId}_${uid}`, teamId, uid, teamRole, addedBy: FOUNDER_UID, addedAt: Timestamp.now() }
}

describe('founder model', () => {
  it('only the founderUid owner is founder', () => {
    expect(isFounder(founder, FOUNDER_UID)).toBe(true)
    expect(isFounder(owner, FOUNDER_UID)).toBe(false)
    expect(isFounder(founder, null)).toBe(false)
  })

  it('a founder demoted from owner loses founder powers', () => {
    const demoted = makeUser({ uid: FOUNDER_UID, role: 'member' })
    expect(isFounder(demoted, FOUNDER_UID)).toBe(false)
  })

  it('only the founder can transfer the legacy', () => {
    expect(canTransferFounder(founder, FOUNDER_UID)).toBe(true)
    expect(canTransferFounder(owner, FOUNDER_UID)).toBe(false)
    expect(canTransferFounder(admin, FOUNDER_UID)).toBe(false)
  })
})

describe('role assignment hierarchy', () => {
  it('only the founder mints owners', () => {
    expect(canAssignRole(founder, 'owner', FOUNDER_UID)).toBe(true)
    expect(canAssignRole(owner, 'owner', FOUNDER_UID)).toBe(false)
    expect(canAssignRole(admin, 'owner', FOUNDER_UID)).toBe(false)
  })

  it('owners mint admins, admins never do', () => {
    expect(canAssignRole(owner, 'admin', FOUNDER_UID)).toBe(true)
    expect(canAssignRole(founder, 'admin', FOUNDER_UID)).toBe(true)
    expect(canAssignRole(admin, 'admin', FOUNDER_UID)).toBe(false)
  })

  it('founder can change an owner role, a regular owner cannot', () => {
    expect(canChangeRole(founder, owner, FOUNDER_UID)).toBe(true)
    expect(canChangeRole(owner, founder, FOUNDER_UID)).toBe(false)
    const otherOwner = makeUser({ uid: 'u-owner-2', role: 'owner' })
    expect(canChangeRole(owner, otherOwner, FOUNDER_UID)).toBe(false)
  })

  it('nobody changes their own role, admins only manage members', () => {
    expect(canChangeRole(founder, founder, FOUNDER_UID)).toBe(false)
    expect(canChangeRole(admin, member, FOUNDER_UID)).toBe(true)
    expect(canChangeRole(admin, owner, FOUNDER_UID)).toBe(false)
    expect(canChangeRole(member, member, FOUNDER_UID)).toBe(false)
  })
})

describe('team isolation', () => {
  const memberships = [
    membership('team-publix', 'u-sean', 'sales'),
    membership('team-harris', 'u-sean', 'sales'),
    membership('team-publix', 'u-am', 'account_manager'),
    membership('team-walmart', 'u-am', 'account_manager'),
  ]
  const sean = makeUser({ uid: 'u-sean' })
  const am = makeUser({ uid: 'u-am' })

  it('a sales person can belong to several teams with the same role', () => {
    expect(getTeamRole(sean, 'team-publix', memberships)).toBe('sales')
    expect(getTeamRole(sean, 'team-harris', memberships)).toBe('sales')
  })

  it('an account manager can serve several teams', () => {
    expect(getTeamRole(am, 'team-publix', memberships)).toBe('account_manager')
    expect(getTeamRole(am, 'team-walmart', memberships)).toBe('account_manager')
  })

  it('teams are isolated: no membership, no access', () => {
    expect(canViewTeam(sean, 'team-walmart', memberships)).toBe(false)
    expect(canViewTeam(am, 'team-harris', memberships)).toBe(false)
    expect(canViewTeam(member, 'team-publix', memberships)).toBe(false)
  })

  it('NPD admins and owners see across all teams', () => {
    expect(canViewTeam(admin, 'team-publix', memberships)).toBe(true)
    expect(canViewTeam(owner, 'team-walmart', memberships)).toBe(true)
    expect(canViewTeam(founder, 'team-harris', memberships)).toBe(true)
  })

  it('only NPD admins/owners manage teams', () => {
    expect(canManageTeams(admin)).toBe(true)
    expect(canManageTeams(owner)).toBe(true)
    expect(canManageTeams(sean)).toBe(false)
  })
})
