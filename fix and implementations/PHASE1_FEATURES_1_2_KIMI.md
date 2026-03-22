# NPD PLANNER — PHASE 1: QUICK WINS (Features 1 & 2)
# Smart AWB Alerts + Auto-escalation for Delayed AWBs
# ═══════════════════════════════════════════════════════════════
# PREREQUISITO: Phase 0 debe estar completa (notifications funcionando).
# Dale a Kimi el archivo KIMI_READ_FIRST.md antes de este.
# ═══════════════════════════════════════════════════════════════


# ─────────────────────────────────────────────────────────────
# SPEC: FEATURE 1 — Smart AWB Alerts
# ─────────────────────────────────────────────────────────────
#
# QUÉ EXISTE HOY:
# - etaChanged boolean en AwbEntry → se setea cuando ETA cambia en CSV
# - etaHistory[] → guarda historial de cambios ETA con timestamps
# - useAwbLookup hook → detecta cambios ETA al parsear CSV de Traze
# - useTrazeRefresh hook → refresh manual con cache de 30 min
# - FlightStatusPanel → muestra AWBs con status Scheduled/Flying/Arrived
# - useNotifications hook → dispara desktop notifications para Planner tasks
# - createNotification() → escribe en Firestore collection notifications
# - NotificationBell + NotificationCenter → UI de notificaciones
#
# QUÉ FALTA:
# - No hay alerta cuando ETA cambia más de 2 horas
# - No hay alerta cuando ATA no llega 6 horas después del ETA
# - etaChanged solo pone un badge amarillo en la UI, no dispara notificación
# - No hay lógica de "cambio significativo" vs "cambio menor"
#
# ARCHIVOS CLAVE:
# - src/renderer/src/hooks/useAwbLookup.ts (detecta cambios ETA)
# - src/renderer/src/hooks/useTrazeRefresh.ts (refresh y comparación)
# - src/renderer/src/lib/firestore.ts (createNotification, updateTaskField)
# - src/renderer/src/types/index.ts (AwbEntry, EtaHistoryEntry)
# - src/main/services/trazeIntegrationService.ts (scheduler cada hora)
#
# ─────────────────────────────────────────────────────────────
# SPEC: FEATURE 2 — Auto-escalation for Delayed AWBs
# ─────────────────────────────────────────────────────────────
#
# QUÉ EXISTE HOY:
# - Subtask interface con id, title, completed, assigneeUid, createdAt
# - task.subtasks[] array en Firestore
# - SubtaskList component para crear/completar subtasks
# - task.assignees[] → quién está asignado al task
#
# QUÉ FALTA:
# - No se auto-crean subtasks basadas en condiciones de AWB
# - No hay lógica que detecte "ATA no llegó 6h después de ETA"
# - No hay asignación automática del subtask al owner del PO
#
# ARCHIVOS CLAVE:
# - src/renderer/src/types/index.ts (Subtask, Task)
# - src/renderer/src/lib/firestore.ts (updateDoc para subtasks)
# - src/renderer/src/hooks/useAwbLookup.ts (donde detectar el delay)
# ─────────────────────────────────────────────────────────────


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P1-1 — Smart AWB Alerts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build smart alerts that notify task assignees when AWB tracking shows
significant changes. Currently, ETA changes only show a yellow "changed"
badge on the AWB row — no notification is fired.

WHAT TO BUILD:

1. ALERT: ETA CHANGED BY MORE THAN 2 HOURS

   File: `src/renderer/src/hooks/useTrazeRefresh.ts`

   Inside the `refreshAwbs` function, after detecting `etaHasChanged = true`,
   add logic to check if the change is SIGNIFICANT (>2 hours difference):

   a. Create a helper function `isSignificantEtaChange` either in this file
      or in `src/renderer/src/utils/awbUtils.ts`:

   ```typescript
   /**
    * Returns true if the ETA shifted by more than `thresholdHours`.
    * Parses both old and new ETA strings ("MM/DD/YYYY HH:mm" or "MM/DD/YYYY").
    */
   export function isSignificantEtaChange(
     oldEta: string | null,
     newEta: string | null,
     thresholdHours: number = 2
   ): boolean
   ```

   - Parse both ETAs using the existing `parseFlightDate` pattern
     (check FlightStatusPanel.tsx or IMPLEMENTATION_PLAN.md for the parser)
   - If either is null/unparseable, return false (can't determine significance)
   - Calculate absolute difference in hours
   - Return true if diff > thresholdHours

   b. After detecting a significant change, create a notification:

   ```typescript
   // Inside the awbs.map loop, after setting etaHasChanged = true:
   if (etaHasChanged && isSignificantEtaChange(awb.eta, newEta, 2)) {
     // We need the task context — pass taskId and task data to refreshAwbs
     // or handle notifications after the map completes
     significantChanges.push({
       awbNumber: awb.number,
       oldEta: awb.eta,
       newEta: newEta,
       taskId,  // already available as parameter
     })
   }
   ```

   c. After the map loop and Firestore update, fire notifications for
      significant changes. You need to:
      - Get the task document to find assignees, title, boardId, boardType
      - For each assignee, call createNotification:

   ```typescript
   import { doc, getDoc } from 'firebase/firestore'
   import { db } from '../lib/firebase'
   import { createNotification } from '../lib/firestore'

   // After Firestore update of awbs:
   if (significantChanges.length > 0) {
     try {
       const taskSnap = await getDoc(doc(db, 'tasks', taskId))
       if (taskSnap.exists()) {
         const taskData = taskSnap.data()
         // Only notify for Planner board tasks
         if (taskData.boardType === 'planner' || /* check board */) {
           for (const change of significantChanges) {
             const diffText = /* calculate hours difference as string */
             for (const uid of (taskData.assignees ?? [])) {
               await createNotification({
                 userId: uid,
                 taskId,
                 taskTitle: taskData.title,
                 boardId: taskData.boardId,
                 boardType: 'planner',
                 type: 'updated',
                 message: `AWB ${change.awbNumber} ETA shifted by ${diffText} — was ${change.oldEta ?? 'unknown'}, now ${change.newEta}`,
                 read: false,
                 triggeredBy: 'system',
                 triggeredByName: 'Traze Auto-Check',
                 createdAt: Timestamp.now(),
               })
             }
           }
         }
       }
     } catch (err) {
       console.error('[SmartAlerts] Failed to send ETA change notification:', err)
     }
   }
   ```

   IMPORTANT: To determine boardType, the task document stores `boardId`
   but not `boardType` directly. You need to either:
   - Query the board document: `getDoc(doc(db, 'boards', taskData.boardId))`
   - Or pass boardType as a parameter to refreshAwbs from the caller

   Check how the existing callers of refreshAwbs (OrderStatusSection) have
   access to boardType and pass it through.

2. ALERT: ATA NOT RECEIVED 6 HOURS AFTER ETA

   File: `src/renderer/src/hooks/useTrazeRefresh.ts`

   In the same `refreshAwbs` map loop, add a second check:

   ```typescript
   // Check for missing ATA when ETA has passed by >6 hours
   if (!newAta && awb.eta) {
     const etaDate = parseFlightDate(awb.eta)
     if (etaDate) {
       const hoursSinceEta = (Date.now() - etaDate.getTime()) / (1000 * 60 * 60)
       if (hoursSinceEta > 6) {
         missingAtaAlerts.push({
           awbNumber: awb.number,
           eta: awb.eta,
           hoursSinceEta: Math.round(hoursSinceEta),
           taskId,
         })
       }
     }
   }
   ```

   After the loop, fire notifications for missing ATAs (same pattern as above):
   - Message: `AWB ${number} — no arrival confirmed ${hours}h after ETA (${eta}). Investigate possible delay.`
   - Type: 'updated'
   - triggeredBy: 'system', triggeredByName: 'Traze Auto-Check'

   DEDUPLICATION: To avoid spamming the same alert every hour (Traze runs
   hourly), track which AWBs have already been alerted. Options:
   - Add a field to AwbEntry: `missingAtaAlertSent: boolean` — set true after first alert
   - Or use a module-level Set: `const alertedMissingAta = new Set<string>()`
     keyed by `${taskId}:${awbNumber}`

   The cleanest approach: add `missingAtaAlertSent` to the AwbEntry type
   (see step 3).

3. TYPE UPDATE

   File: `src/renderer/src/types/index.ts`

   Add to AwbEntry interface:

   ```typescript
   export interface AwbEntry {
     // ...existing fields...
     missingAtaAlertSent: boolean  // true after "no ATA 6h post-ETA" alert fired
   }
   ```

   Then search codebase for every place that creates an AwbEntry literal
   and add `missingAtaAlertSent: false`:
   ```bash
   grep -rn "etaChanged:" src/ --include="*.ts" --include="*.tsx" -l
   ```

4. ALSO APPLY TO useAwbLookup.ts

   The same alert logic should also exist in `useAwbLookup.ts` → `lookupAwbsInTask`,
   because that hook also processes CSV data. However, useTrazeRefresh is the
   primary one (called from OrderStatusSection's Update button and from the
   scheduled Traze downloads). Check if useAwbLookup is still actively used
   or if useTrazeRefresh replaced it. If both are active, add the same
   significant-change detection to both.

   If useAwbLookup is legacy/unused, skip it and add a comment:
   ```typescript
   // NOTE: Smart alerts are handled in useTrazeRefresh.ts
   ```

Run `npm run typecheck` — must pass.
Test: 
- Set up a task with an AWB that has an ETA
- Manually change the ETA in Traze CSV (or mock it) to shift >2 hours
- Verify notification appears in NotificationCenter
- Verify desktop notification fires (if not in DND)
Commit: "feat: smart AWB alerts for significant ETA changes and missing ATA"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P1-2 — Auto-escalation for Delayed AWBs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build auto-escalation: when an AWB has no ATA 6 hours after ETA,
automatically create a subtask "Investigate delay — AWB {number}"
and assign it to the first assignee of the parent task.

PREREQUISITE: P1-1 must be completed (missingAtaAlertSent field exists).

WHAT TO BUILD:

1. AUTO-CREATE SUBTASK ON MISSING ATA

   File: `src/renderer/src/hooks/useTrazeRefresh.ts`

   In the section where you detect `missingAtaAlerts` (from P1-1),
   AFTER sending the notification, also create a subtask:

   ```typescript
   import { Timestamp } from 'firebase/firestore'
   import { nanoid } from 'nanoid'
   import type { Subtask } from '../types'

   // After sending the missing-ATA notification:
   for (const alert of missingAtaAlerts) {
     try {
       const taskSnap = await getDoc(doc(db, 'tasks', alert.taskId))
       if (!taskSnap.exists()) continue
       const taskData = taskSnap.data()

       // Check if a subtask for this AWB delay already exists
       const existingSubtasks: Subtask[] = taskData.subtasks ?? []
       const alreadyHasSubtask = existingSubtasks.some(
         (s) => s.title.includes(alert.awbNumber) && s.title.includes('Investigate delay')
       )
       if (alreadyHasSubtask) continue  // don't duplicate

       // Create the new subtask
       const newSubtask: Subtask = {
         id: nanoid(),
         title: `Investigate delay — AWB ${alert.awbNumber} (no ATA ${alert.hoursSinceEta}h after ETA)`,
         completed: false,
         assigneeUid: (taskData.assignees?.[0]) ?? null,  // assign to first assignee
         createdAt: Timestamp.now(),
       }

       // Append to existing subtasks
       const updatedSubtasks = [...existingSubtasks, newSubtask]

       await updateDoc(doc(db, 'tasks', alert.taskId), {
         subtasks: updatedSubtasks,
         updatedAt: Timestamp.now(),
       })

       console.log(`[AutoEscalation] Created subtask for AWB ${alert.awbNumber} on task ${alert.taskId}`)
     } catch (err) {
       console.error('[AutoEscalation] Failed to create delay subtask:', err)
     }
   }
   ```

2. PREVENT DUPLICATE SUBTASKS

   The check `alreadyHasSubtask` above prevents creating the same subtask
   every hour. But also ensure:
   - If the AWB eventually gets an ATA (delay resolved), the subtask stays
     but is no longer auto-created. The `missingAtaAlertSent` flag from P1-1
     handles this — once set to true, the alert logic skips the AWB.
   - If someone manually deletes the subtask and the AWB still has no ATA,
     it should NOT be re-created (the `missingAtaAlertSent` flag persists
     in Firestore on the AWB entry, so it won't trigger again).

3. RESET FLAG WHEN ATA ARRIVES

   File: `src/renderer/src/hooks/useTrazeRefresh.ts`

   In the awbs.map loop, when a new ATA is detected for an AWB that
   previously had `missingAtaAlertSent: true`, reset it:

   ```typescript
   // Inside the map, after checking match:
   if (newAta && awb.missingAtaAlertSent) {
     // ATA arrived — reset the flag
     return {
       ...awb,
       // ...other updated fields...
       missingAtaAlertSent: false,  // resolved
     }
   }
   ```

   This allows the system to re-alert if a future AWB on the same task
   has issues.

4. ADD TASK HISTORY ENTRY

   When auto-creating a subtask, also write to taskHistory for audit trail:

   ```typescript
   import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

   // After creating the subtask:
   await addDoc(collection(db, 'taskHistory'), {
     taskId: alert.taskId,
     userId: 'system',
     userName: 'Traze Auto-Check',
     action: 'updated' as const,
     field: 'subtasks',
     oldValue: null,
     newValue: `Auto-created: Investigate delay — AWB ${alert.awbNumber}`,
     timestamp: serverTimestamp(),
   })
   ```

5. NOTIFICATION MESSAGE UPDATE

   The notification from P1-1 for missing ATA should now mention that
   a subtask was created:

   ```
   AWB {number} — no arrival confirmed {hours}h after ETA ({eta}).
   A subtask has been created to investigate.
   ```

Run `npm run typecheck` — must pass.
Test:
- Create a task with an AWB that has an ETA in the past (>6 hours ago) and no ATA
- Trigger a Traze refresh (click Update button in Order Status section)
- Verify: subtask "Investigate delay — AWB xxx" appears in the subtask list
- Verify: subtask is assigned to the first assignee of the task
- Verify: notification appears in NotificationCenter
- Verify: triggering refresh again does NOT create a duplicate subtask
- Verify: if ATA arrives later, the missingAtaAlertSent flag resets
Commit: "feat: auto-escalation subtask for AWBs with missing ATA after 6 hours"
