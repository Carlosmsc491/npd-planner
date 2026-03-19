/**
 * useTrazeRefresh Hook
 * =====================
 * File path: src/renderer/src/hooks/useTrazeRefresh.ts
 *
 * React hook for refreshing AWB data with 30-minute cache logic.
 * Used by OrderStatusSection for the refresh button.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AwbEntry } from '../types';
import { parseTrazeCsv, findAwbInCsv, etaChanged } from '../utils/awbUtils';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

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
  refreshAwbs: (taskId: string, awbs: AwbEntry[]) => Promise<AwbEntry[]>;
}

export function useTrazeRefresh(): UseTrazeRefreshReturn {
  const api = window.electronAPI;
  const isMountedRef = useRef(true);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshMessage, setLastRefreshMessage] = useState<string | null>(null);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Looks up AWBs in the latest CSV and updates Firestore if ETAs changed.
   * Handles the 30-minute cache logic internally.
   */
  const refreshAwbs = useCallback(async (
    taskId: string,
    awbs: AwbEntry[]
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
        console.warn('[useTrazeRefresh] No CSV available after refresh');
        return awbs;
      }
      
      // Step 3: Parse CSV and lookup AWBs
      const csvRows = parseTrazeCsv(csvResult.content);
      const now = Timestamp.now();
      let hasChange = false;
      
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
        
        if (!etaHasChanged && awb.carrier === newCarrier && awb.ata === newAta) {
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
        };
      });
      
      // Step 4: Persist to Firestore only if something changed
      if (hasChange) {
        await updateDoc(doc(db, 'tasks', taskId), {
          awbs: updatedAwbs,
          updatedAt: now,
        });
      }
      
      return updatedAwbs;
      
    } catch (err) {
      console.error('[useTrazeRefresh] Error during refresh:', err);
      if (isMountedRef.current) {
        setLastRefreshMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
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
    refreshAwbs,
  };
}
