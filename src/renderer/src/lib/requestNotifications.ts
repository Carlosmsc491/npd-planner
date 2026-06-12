// src/renderer/src/lib/requestNotifications.ts
// Who gets an in-app notification for each sample-request event. Pure logic,
// unit tested. The actor is never notified about their own action.

import type { SampleRequest } from '../types'

type RequestParticipants = Pick<SampleRequest, 'createdBy' | 'assignedManagers' | 'helpers'>

/** Everyone involved in the request (creator + managers + helpers), deduped,
 *  excluding the actor. */
export function requestParticipantUids(
  req: RequestParticipants,
  actorUid: string
): string[] {
  const uids = new Set<string>([req.createdBy, ...req.assignedManagers, ...req.helpers])
  uids.delete(actorUid)
  return [...uids]
}

/** A new request notifies NPD admins/owners (they triage the queue),
 *  excluding the actor when an admin filed it themselves. */
export function newRequestRecipients(adminUids: string[], actorUid: string): string[] {
  return [...new Set(adminUids)].filter((uid) => uid !== actorUid)
}
