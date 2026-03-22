/**
 * useTrazeRefresh Hook
 * =====================
 * File path: src/renderer/src/hooks/useTrazeRefresh.ts
 *
 * React hook for refreshing AWB data with 30-minute cache logic.
 * Used by OrderStatusSection for the refresh button.
 * 
 * FEATURES:
 * - Smart AWB Alerts: notifies when ETA changes > 2 hours or ATA missing > 6 hours after ETA
 * - Auto-escalation: creates subtasks for delayed AWBs
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AwbEntry, Subtask, Task, AppNotification } from '../types';
import { 
  parseTrazeCsv, 
  findAwbInCsv, 
  etaChanged, 
  isSignificantEtaChange, 
  parseFlightDate,
  formatDurationHours 
} from '../utils/awbUtils';
import { doc, updateDoc, Timestamp, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createNotification } from '../lib/firestore';
import { nanoid } from 'nanoid';

interface CsvStatus {
  exists: boolean;
  filePath: string | null;
  downloadedAt: string | null;
  sizeKb: number | null;
}

interface RefreshResult {
  usedCache: boolean;
  message: string;
  error?: boolean;
  csvStatus?: CsvStatus;
}

interface UseTrazeRefreshReturn {
  isRefreshing: boolean;
  lastRefreshMessage: string | null;
  lastRefreshError: string | null;
  refreshAwbs: (taskId: string, awbs: AwbEntry[], boardType?: string) => Promise<AwbEntry[]>;
  clearError: () => void;
}

export function useTrazeRefresh(): UseTrazeRefreshReturn {
  const api = window.electronAPI;
  const isMountedRef = useRef(true);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshMessage, setLastRefreshMessage] = useState<string | null>(null);
  const [lastRefreshError, setLastRefreshError] = useState<string | null>(null);
  
  const clearError = useCallback(() => {
    setLastRefreshError(null);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Looks up AWBs in the latest CSV and updates Firestore if ETAs changed.
   * Handles the 30-minute cache logic internally.
   * 
   * @param taskId - The task ID
   * @param awbs - Array of AWB entries to refresh
   * @param boardType - Optional board type (e.g., 'planner'). If not provided, will be looked up.
   */
  const refreshAwbs = useCallback(async (
    taskId: string,
    awbs: AwbEntry[],
    boardType?: string
  ): Promise<AwbEntry[]> => {
    if (!api?.invoke || awbs.length === 0) return awbs;
    
    setIsRefreshing(true);
    if (isMountedRef.current) setLastRefreshMessage(null);
    
    try {
      // Step 1: Trigger refresh (this handles 30-min cache logic)
      const refreshResult = await api.invoke('traze:refresh-csv') as RefreshResult;
      if (isMountedRef.current) setLastRefreshMessage(refreshResult.message);
      
      if (refreshResult.error) {
        console.error('[useTrazeRefresh] Refresh failed:', refreshResult.message);
        if (isMountedRef.current) {
          setLastRefreshError(refreshResult.message);
        }
        return awbs;
      }
      
      // Step 2: Get the latest CSV content
      const csvResult = await api.invoke('awb:get-latest-csv') as {
        content: string | null;
        exists: boolean;
        downloadedAt: string | null;
        sizeKb: number | null;
      };
      
      if (!csvResult.exists || !csvResult.content) {
        const msg = 'No CSV data available. Please check Traze credentials.';
        console.warn('[useTrazeRefresh]', msg);
        if (isMountedRef.current) {
          setLastRefreshError(msg);
        }
        return awbs;
      }
      
      // Step 3: Parse CSV and lookup AWBs
      const csvRows = parseTrazeCsv(csvResult.content);
      const now = Timestamp.now();
      let hasChange = false;
      
      // Track alerts for notifications
      const significantChanges: Array<{
        awbNumber: string;
        oldEta: string | null;
        newEta: string | null;
        taskId: string;
      }> = [];
      
      const missingAtaAlerts: Array<{
        awbNumber: string;
        eta: string;
        hoursSinceEta: number;
        taskId: string;
      }> = [];
      
      const updatedAwbs: AwbEntry[] = awbs.map(awb => {
        const match = findAwbInCsv(awb.number, csvRows);
        
        if (!match) {
          // Not found in CSV → update lastCheckedAt only
          return { ...awb, lastCheckedAt: now };
        }
        
        const newEta = match.eta || awb.eta;
        const newAta = match.ata || awb.ata;
        const newCarrier = match.carrier || awb.carrier;
        const newShipDate = match.shipDate || awb.shipDate;
        
        const etaHasChanged = etaChanged(awb.eta, match.eta);
        
        // ─────────────────────────────────────────────────────────────
        // FEATURE 1: Smart AWB Alerts
        // ─────────────────────────────────────────────────────────────
        
        // Alert 1: ETA changed by more than 2 hours
        if (etaHasChanged && isSignificantEtaChange(awb.eta, newEta, 2)) {
          significantChanges.push({
            awbNumber: awb.number,
            oldEta: awb.eta,
            newEta: newEta,
            taskId,
          });
        }
        
        // Alert 2: ATA not received 6 hours after ETA
        // Only check if we haven't already sent this alert
        if (!newAta && awb.eta && !awb.missingAtaAlertSent) {
          const etaDate = parseFlightDate(awb.eta);
          if (etaDate) {
            const hoursSinceEta = (Date.now() - etaDate.getTime()) / (1000 * 60 * 60);
            if (hoursSinceEta > 6) {
              missingAtaAlerts.push({
                awbNumber: awb.number,
                eta: awb.eta,
                hoursSinceEta: Math.round(hoursSinceEta),
                taskId,
              });
            }
          }
        }
        
        // FEATURE 3: Reset flag when ATA arrives
        const shouldResetMissingAtaFlag = newAta && awb.missingAtaAlertSent;
        
        if (!etaHasChanged && awb.carrier === newCarrier && awb.ata === newAta && !shouldResetMissingAtaFlag) {
          // Nothing changed, just update lastCheckedAt
          return { ...awb, lastCheckedAt: now, etaChanged: false };
        }
        
        hasChange = true;
        
        // Build history entry for ETA change
        const currentHistory = awb.etaHistory || [];
        const newHistory = etaHasChanged
          ? [
              ...currentHistory,
              {
                eta: newEta ?? '',
                recordedAt: now,
                source: 'auto' as const,
                previousEta: awb.eta,
              },
            ]
          : currentHistory;
        
        // Keep history capped at 50 entries
        const cappedHistory = newHistory.length > 50
          ? newHistory.slice(newHistory.length - 50)
          : newHistory;
        
        return {
          ...awb,
          carrier: newCarrier,
          shipDate: newShipDate,
          eta: newEta,
          ata: newAta,
          etaChanged: etaHasChanged,
          lastCheckedAt: now,
          etaHistory: cappedHistory,
          // Reset missingAtaAlertSent when ATA arrives, keep true if alert was sent
          missingAtaAlertSent: shouldResetMissingAtaFlag 
            ? false 
            : (awb.missingAtaAlertSent || missingAtaAlerts.some(a => a.awbNumber === awb.number)),
        };
      });
      
      // Step 4: Persist to Firestore only if something changed
      if (hasChange) {
        await updateDoc(doc(db, 'tasks', taskId), {
          awbs: updatedAwbs,
          updatedAt: now,
        });
      }
      
      // Step 5: Get task data for notifications (need boardType and assignees)
      let effectiveBoardType = boardType;
      let taskData: Task | null = null;
      
      // If boardType not provided, look it up from the board
      if (!effectiveBoardType || significantChanges.length > 0 || missingAtaAlerts.length > 0) {
        try {
          const taskSnap = await getDoc(doc(db, 'tasks', taskId));
          if (taskSnap.exists()) {
            taskData = taskSnap.data() as Task;
            if (!effectiveBoardType && taskData?.boardId) {
              const boardSnap = await getDoc(doc(db, 'boards', taskData.boardId));
              if (boardSnap.exists()) {
                effectiveBoardType = (boardSnap.data() as { type?: string }).type as string;
              }
            }
          }
        } catch (err) {
          console.error('[useTrazeRefresh] Failed to get task/board data:', err);
        }
      }
      
      // Step 6: Send notifications for significant ETA changes (Planner board only)
      if (significantChanges.length > 0 && effectiveBoardType === 'planner' && taskData) {
        try {
          for (const change of significantChanges) {
            const diffHours = parseFlightDate(change.oldEta) && parseFlightDate(change.newEta)
              ? Math.abs(
                  (parseFlightDate(change.newEta)!.getTime() - parseFlightDate(change.oldEta)!.getTime()) 
                  / (1000 * 60 * 60)
                )
              : 0;
            const diffText = formatDurationHours(diffHours);
            
            for (const uid of (taskData.assignees ?? [])) {
              await createNotification({
                userId: uid,
                taskId,
                taskTitle: taskData.title ?? 'Unknown Task',
                boardId: taskData.boardId ?? '',
                boardType: 'planner',
                type: 'updated',
                message: `AWB ${change.awbNumber} ETA shifted by ${diffText} — was ${change.oldEta ?? 'unknown'}, now ${change.newEta}`,
                read: false,
                triggeredBy: 'system',
                triggeredByName: 'Traze Auto-Check',
              } as Omit<AppNotification, 'id'>);
            }
          }
          console.log(`[SmartAlerts] Sent ${significantChanges.length} ETA change notification(s)`);
        } catch (err) {
          console.error('[SmartAlerts] Failed to send ETA change notification:', err);
        }
      }
      
      // Step 7: Send notifications and create subtasks for missing ATA (Planner board only)
      if (missingAtaAlerts.length > 0 && effectiveBoardType === 'planner' && taskData) {
        try {
          const taskSnap = await getDoc(doc(db, 'tasks', taskId));
          if (!taskSnap.exists()) return updatedAwbs;
          
          const fullTaskData = taskSnap.data() as Task;
          const existingSubtasks: Subtask[] = fullTaskData.subtasks ?? [];
          
          for (const alert of missingAtaAlerts) {
            // Check if a subtask for this AWB delay already exists
            const alreadyHasSubtask = existingSubtasks.some(
              (s) => s.title.includes(alert.awbNumber) && s.title.includes('Investigate delay')
            );
            
            if (alreadyHasSubtask) continue; // don't duplicate
            
            // Create the new subtask
            const newSubtask: Subtask = {
              id: nanoid(),
              title: `Investigate delay — AWB ${alert.awbNumber} (no ATA ${alert.hoursSinceEta}h after ETA)`,
              completed: false,
              assigneeUid: (taskData.assignees?.[0]) ?? null,  // assign to first assignee
              createdAt: Timestamp.now(),
            };
            
            // Append to existing subtasks
            const updatedSubtasks = [...existingSubtasks, newSubtask];
            
            // Update task with new subtask
            await updateDoc(doc(db, 'tasks', alert.taskId), {
              subtasks: updatedSubtasks,
              updatedAt: Timestamp.now(),
            });
            
            // Add to local array to prevent duplicates in this batch
            existingSubtasks.push(newSubtask);
            
            console.log(`[AutoEscalation] Created subtask for AWB ${alert.awbNumber} on task ${alert.taskId}`);
            
            // Add task history entry for audit trail
            await addDoc(collection(db, 'taskHistory'), {
              taskId: alert.taskId,
              userId: 'system',
              userName: 'Traze Auto-Check',
              action: 'updated' as const,
              field: 'subtasks',
              oldValue: null,
              newValue: `Auto-created: Investigate delay — AWB ${alert.awbNumber}`,
              timestamp: serverTimestamp(),
            });
            
            // Send notification about missing ATA with subtask creation mention
            for (const uid of (taskData.assignees ?? [])) {
              await createNotification({
                userId: uid,
                taskId,
                taskTitle: taskData.title ?? 'Unknown Task',
                boardId: taskData.boardId ?? '',
                boardType: 'planner',
                type: 'updated',
                message: `AWB ${alert.awbNumber} — no arrival confirmed ${alert.hoursSinceEta}h after ETA (${alert.eta}). A subtask has been created to investigate.`,
                read: false,
                triggeredBy: 'system',
                triggeredByName: 'Traze Auto-Check',
              } as Omit<AppNotification, 'id'>);
            }
          }
        } catch (err) {
          console.error('[AutoEscalation] Failed to process missing ATA alert:', err);
        }
      }
      
      return updatedAwbs;
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[useTrazeRefresh] Error during refresh:', err);
      if (isMountedRef.current) {
        setLastRefreshError(errorMsg);
        setLastRefreshMessage(`Error: ${errorMsg}`);
      }
      return awbs;
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [api]);

  return {
    isRefreshing,
    lastRefreshMessage,
    lastRefreshError,
    refreshAwbs,
    clearError,
  };
}
