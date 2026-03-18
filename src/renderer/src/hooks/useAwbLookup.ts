/**
 * useAwbLookup Hook
 * ==================
 * File path: src/renderer/hooks/useAwbLookup.ts
 *
 * React hook that manages AWB tracking for a task.
 *
 * RESPONSIBILITIES:
 *   1. Listen for new CSV downloads (traze:csv-downloaded)
 *   2. On new CSV: read CSV content via IPC, parse it, look up each AWB
 *   3. If ETA changed: update Firestore task + add to etaHistory + set etaChanged flag
 *   4. Provide lookup data to the OrderStatusSection component
 */

import { useEffect, useState, useCallback } from 'react';
import { doc, updateDoc, Timestamp }        from 'firebase/firestore';
import { db }                               from '../lib/firebase';
import type { AwbEntry, EtaHistoryEntry }   from '../types';
import { parseTrazeCsv, findAwbInCsv, etaChanged } from '../utils/awbUtils';
import { nanoid } from 'nanoid';

interface CsvDownloadedPayload {
  filePath:     string
  rowCount:     number
  sizeKb:       number
  downloadedAt: string
}

interface CsvStatusResult {
  exists:       boolean
  downloadedAt: string | null
  sizeKb:       number | null
}

interface LatestCsvResult {
  content:      string | null
  exists:       boolean
  downloadedAt: string | null
  sizeKb:       number | null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseAwbLookupReturn {
  csvStatus:      CsvStatusResult
  isLooking:      boolean
  /** Reads the latest CSV and updates the task's AWB entries in Firestore if ETAs changed */
  lookupAwbsInTask: (taskId: string, awbs: AwbEntry[]) => Promise<AwbEntry[]>
  /** Forces an immediate download from Traze */
  downloadNow:    () => Promise<void>
  traze: {
    connected:    boolean
    connecting:   boolean
    showLogin:    () => void
  }
}

export function useAwbLookup(): UseAwbLookupReturn {
  const [csvStatus, setCsvStatus]   = useState<CsvStatusResult>({ exists: false, downloadedAt: null, sizeKb: null });
  const [isLooking, setIsLooking]   = useState(false);
  const [trazeConnected, setTrazeConnected] = useState(false);
  const [trazeConnecting, setTrazeConnecting] = useState(false);

  const api = window.electronAPI;

  // ── Load initial CSV status ────────────────────────────────────────────────
  useEffect(() => {
    if (!api?.invoke) return;
    api.invoke('traze:get-status').then(result => {
      const s = result as CsvStatusResult;
      setCsvStatus(s);
    }).catch(() => {/* non-critical */});

    // Check Traze auth status
    api.invoke('traze:check-auth').then(result => {
      const r = result as { authenticated: boolean };
      setTrazeConnected(r.authenticated);
    }).catch(() => {/* non-critical */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for new CSV downloads ──────────────────────────────────────────
  useEffect(() => {
    if (!api?.on) return;

    const onDownloaded = (_event: unknown, payload: CsvDownloadedPayload) => {
      setCsvStatus({ exists: true, downloadedAt: payload.downloadedAt, sizeKb: payload.sizeKb });
      setTrazeConnected(true);
    };

    const onNeedsLogin = () => {
      setTrazeConnected(false);
    };

    const onLoginSuccess = () => {
      setTrazeConnected(true);
    };

    api.on('traze:csv-downloaded', onDownloaded as (...args: unknown[]) => void);
    api.on('traze:needs-login',    onNeedsLogin);
    api.on('traze:login-success',  onLoginSuccess);

    return () => {
      api.off?.('traze:csv-downloaded', onDownloaded as (...args: unknown[]) => void);
      api.off?.('traze:needs-login',    onNeedsLogin);
      api.off?.('traze:login-success',  onLoginSuccess);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lookup AWBs in latest CSV and update Firestore if changed ─────────────
  const lookupAwbsInTask = useCallback(async (
    taskId: string,
    awbs:   AwbEntry[]
  ): Promise<AwbEntry[]> => {
    if (!api?.invoke || awbs.length === 0) return awbs;

    setIsLooking(true);

    try {
      const result = await api.invoke('awb:get-latest-csv') as LatestCsvResult;

      if (!result.exists || !result.content) {
        return awbs; // no CSV available yet
      }

      const csvRows   = parseTrazeCsv(result.content as string);
      const now       = Timestamp.now();
      let   hasChange = false;

      const updatedAwbs: AwbEntry[] = awbs.map(awb => {
        const match = findAwbInCsv(awb.number, csvRows);
        if (!match) {
          // Not found in CSV → update lastCheckedAt only
          return { ...awb, lastCheckedAt: now };
        }

        const newEta     = match.eta  || awb.eta;
        const newAta     = match.ata  || awb.ata;
        const newCarrier = match.carrier  || awb.carrier;
        const newShip    = match.shipDate || awb.shipDate;

        const etaHasChanged = etaChanged(awb.eta, match.eta);

        if (!etaHasChanged && awb.carrier === newCarrier && awb.ata === newAta) {
          // Nothing changed, just update lastCheckedAt
          return { ...awb, lastCheckedAt: now, etaChanged: false };
        }

        hasChange = true;

        // Build history entry for ETA change
        const newHistory: EtaHistoryEntry[] = etaHasChanged
          ? [
              ...awb.etaHistory,
              {
                eta:         newEta ?? '',
                recordedAt:  now,
                source:      'auto' as const,
                previousEta: awb.eta,
              },
            ]
          : awb.etaHistory;

        // Keep history capped at 50 entries
        const cappedHistory = newHistory.length > 50
          ? newHistory.slice(newHistory.length - 50)
          : newHistory;

        return {
          ...awb,
          carrier:      newCarrier,
          shipDate:     newShip,
          eta:          newEta,
          ata:          newAta,
          etaChanged:   etaHasChanged,
          lastCheckedAt: now,
          etaHistory:   cappedHistory,
        };
      });

      // Persist to Firestore only if something changed
      if (hasChange) {
        await updateDoc(doc(db, 'tasks', taskId), {
          awbs:      updatedAwbs,
          updatedAt: now,
        });
      }

      return updatedAwbs;

    } catch (err) {
      console.error('[useAwbLookup] Error during AWB lookup:', err);
      return awbs;
    } finally {
      setIsLooking(false);
    }
  }, [api]);

  // ── Manual download ────────────────────────────────────────────────────────
  const downloadNow = useCallback(async () => {
    if (!api?.invoke) return;
    setTrazeConnecting(true);
    try {
      await api.invoke('traze:download-now');
    } finally {
      setTrazeConnecting(false);
    }
  }, [api]);

  // ── Show Traze login window ───────────────────────────────────────────────
  const showLogin = useCallback(() => {
    api?.send?.('traze:show-login-window');
  }, [api]);

  // Suppress unused variable warning — nanoid is used in OrderStatusSection
  void nanoid;

  return {
    csvStatus,
    isLooking,
    lookupAwbsInTask,
    downloadNow,
    traze: {
      connected:  trazeConnected,
      connecting: trazeConnecting,
      showLogin,
    },
  };
}
