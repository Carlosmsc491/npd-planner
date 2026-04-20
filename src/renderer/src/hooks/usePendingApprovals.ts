// src/renderer/src/hooks/usePendingApprovals.ts
// Real-time listener for pending user approvals.
// Only active for admin and owner users.

import { useEffect, useState } from 'react'
import { subscribePendingApprovals } from '../lib/firestore'
import type { AppUser, PendingApproval } from '../types'
import { isPrivileged } from '../lib/permissions'

export function usePendingApprovals(currentUser: AppUser | null): PendingApproval[] {
  const [pending, setPending] = useState<PendingApproval[]>([])

  useEffect(() => {
    if (!currentUser || !isPrivileged(currentUser)) {
      setPending([])
      return
    }

    const unsub = subscribePendingApprovals((approvals) => {
      // Sort by registeredAt ascending (oldest first in queue)
      const sorted = [...approvals].sort((a, b) => {
        const at = a.registeredAt?.toMillis?.() ?? 0
        const bt = b.registeredAt?.toMillis?.() ?? 0
        return at - bt
      })
      setPending(sorted)
    })

    return unsub
  }, [currentUser?.uid])

  return pending
}
