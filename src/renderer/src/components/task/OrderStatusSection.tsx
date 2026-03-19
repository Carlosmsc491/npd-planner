/**
 * OrderStatusSection Component
 * ==============================
 * File path: src/renderer/components/task/OrderStatusSection.tsx
 *
 * Renders the "Order Status" section inside the TaskPage modal.
 * Shows PO number and Air Waybills with auto-filled tracking data from Traze.
 * Only shown for Planner Board tasks.
 */

import { useState, useEffect, useRef } from 'react';
import { Timestamp }     from 'firebase/firestore';
import type { AwbEntry, EtaHistoryEntry } from '../../types';
import { nanoid }        from 'nanoid';
import { RefreshCw }     from 'lucide-react';
import { useTrazeRefresh } from '../../hooks/useTrazeRefresh';

// ─── ETA History Popover ──────────────────────────────────────────────────────

interface EtaHistoryPopoverProps {
  awbNumber: string
  history:   EtaHistoryEntry[]
  onClose:   () => void
}

function EtaHistoryPopover({ awbNumber, history, onClose }: EtaHistoryPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const formatTs = (ts: Timestamp) =>
    new Date(ts.seconds * 1000).toLocaleString('en-US', {
      month:  '2-digit',
      day:    '2-digit',
      hour:   '2-digit',
      minute: '2-digit',
    });

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3 w-72"
      style={{ top: '100%', left: 0, marginTop: 4 }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
          ETA History — {awbNumber}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      {!history || history.length === 0 ? (
        <p className="text-xs text-gray-400">No history yet.</p>
      ) : (
        <div className="space-y-2">
          {[...(history || [])].reverse().map((entry, idx) => (
            <div key={idx} className="border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTs(entry.recordedAt)}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">
                  {entry.source === 'auto' ? 'auto' : 'manual'}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mt-0.5">
                {entry.eta || '—'}
              </p>
              {entry.previousEta && (
                <p className="text-xs text-gray-400">
                  ← was: {entry.previousEta}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AWB Row ──────────────────────────────────────────────────────────────────

interface AwbRowProps {
  awb:        AwbEntry
  readonly:   boolean
  onChange:   (updated: AwbEntry) => void
  onDelete:   () => void
  onClearChanged: () => void
}

function AwbRow({ awb, readonly, onChange, onDelete }: AwbRowProps) {
  const [showHistory, setShowHistory] = useState(false);
  
  // Ensure awb has default values to prevent crashes
  const safeAwb: AwbEntry = {
    id: awb.id || '',
    number: awb.number || '',
    boxes: awb.boxes || 0,
    carrier: awb.carrier || null,
    shipDate: awb.shipDate || null,
    eta: awb.eta || null,
    ata: awb.ata || null,
    guia: awb.guia || null,
    etaChanged: awb.etaChanged || false,
    lastCheckedAt: awb.lastCheckedAt || null,
    etaHistory: awb.etaHistory || [],
  };

  const handleField = (field: keyof AwbEntry, value: string | number) => {
    onChange({ ...safeAwb, [field]: value });
  };

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 last:border-0 group">
      {/* AWB Number */}
      <td className="py-2 pr-2">
        {readonly ? (
          <span className="text-sm font-mono text-gray-800 dark:text-gray-100">{safeAwb.number}</span>
        ) : (
          <input
            type="text"
            value={safeAwb.number}
            onChange={e => handleField('number', e.target.value)}
            placeholder="369-0000-0000"
            className="w-32 text-sm font-mono bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-[#1D9E75] outline-none text-gray-800 dark:text-gray-100 placeholder-gray-300"
          />
        )}
      </td>

      {/* Boxes */}
      <td className="py-2 pr-2">
        {readonly ? (
          <span className="text-sm text-gray-700 dark:text-gray-300">{safeAwb.boxes}</span>
        ) : (
          <input
            type="number"
            min={0}
            value={safeAwb.boxes || ''}
            onChange={e => handleField('boxes', parseInt(e.target.value) || 0)}
            placeholder="0"
            className="w-14 text-sm bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-[#1D9E75] outline-none text-gray-800 dark:text-gray-100 placeholder-gray-300"
          />
        )}
      </td>

      {/* Carrier (auto-filled from CSV) */}
      <td className="py-2 pr-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {safeAwb.carrier || '—'}
        </span>
      </td>

      {/* Ship Date (auto-filled from CSV) */}
      <td className="py-2 pr-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {safeAwb.shipDate || '—'}
        </span>
      </td>

      {/* ETA */}
      <td className="py-2 pr-2 relative">
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {safeAwb.eta || '—'}
          </span>
          {safeAwb.etaChanged && (
            <div className="relative">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                title="ETA changed — click to see history"
              >
                <span>⚠</span>
                <span>changed</span>
              </button>
              {showHistory && (
                <EtaHistoryPopover
                  awbNumber={safeAwb.number}
                  history={safeAwb.etaHistory}
                  onClose={() => setShowHistory(false)}
                />
              )}
            </div>
          )}
        </div>
      </td>

      {/* ATA (auto-filled from CSV) */}
      <td className="py-2 pr-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {safeAwb.ata || '—'}
        </span>
      </td>

      {/* Guia */}
      <td className="py-2 pr-2">
        {readonly ? (
          <span className="text-sm text-gray-600 dark:text-gray-400">{safeAwb.guia || '—'}</span>
        ) : (
          <input
            type="text"
            value={safeAwb.guia ?? ''}
            onChange={(e) => onChange({ ...safeAwb, guia: e.target.value || null })}
            placeholder="Guía #"
            className="w-28 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
          />
        )}
      </td>

      {/* Actions */}
      {!readonly && (
        <td className="py-2 text-right">
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors text-sm p-1"
            title="Remove AWB"
          >
            ✕
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OrderStatusSectionProps {
  taskId:            string
  poNumber:          string
  poNumbers:         string[]
  awbs:              AwbEntry[]
  onPoNumbersChange: (numbers: string[]) => void
  onAwbsChange:      (awbs: AwbEntry[]) => void
  readonly?:         boolean
  csvStatus?: {
    exists:       boolean
    downloadedAt: string | null
  }
}

export function OrderStatusSection({
  taskId,
  poNumber,
  poNumbers,
  awbs,
  onPoNumbersChange,
  onAwbsChange,
  readonly = false,
  csvStatus,
}: OrderStatusSectionProps) {
  
  // Ensure awbs is always an array
  const safeAwbs = awbs || [];

  // Local state for PO numbers to avoid duplications from prop merging
  const [localPos, setLocalPos] = useState<string[]>(() =>
    poNumbers.length > 0 ? poNumbers : (poNumber ? [poNumber] : [''])
  )

  useEffect(() => {
    setLocalPos(poNumbers.length > 0 ? poNumbers : (poNumber ? [poNumber] : ['']))
  }, [poNumbers, poNumber])

  // Smart refresh hook with 30-min cache logic
  const { isRefreshing, lastRefreshMessage, refreshAwbs } = useTrazeRefresh();
  
  // Handle Update button click
  const handleUpdate = async () => {
    if (isRefreshing) return;
    
    const updatedAwbs = await refreshAwbs(taskId, safeAwbs);
    // Only update if there were changes
    if (updatedAwbs !== safeAwbs) {
      onAwbsChange(updatedAwbs);
    }
  };

  const addAwb = () => {
    const newEntry: AwbEntry = {
      id:            nanoid(),
      number:        '',
      boxes:         0,
      carrier:       null,
      shipDate:      null,
      eta:           null,
      ata:           null,
      guia:          null,
      etaChanged:    false,
      lastCheckedAt: null,
      etaHistory:    [],
    };
    onAwbsChange([...safeAwbs, newEntry]);
  };

  const updateAwb = (index: number, updated: AwbEntry) => {
    const next = [...safeAwbs];
    next[index] = updated;
    onAwbsChange(next);
  };

  const deleteAwb = (index: number) => {
    onAwbsChange(safeAwbs.filter((_, i) => i !== index));
  };

  const clearChanged = (index: number) => {
    const next = [...safeAwbs];
    next[index] = { ...next[index], etaChanged: false };
    onAwbsChange(next);
  };

  const totalBoxes = safeAwbs.reduce((sum, a) => sum + (a.boxes || 0), 0);

  const formatLastDownload = () => {
    if (!csvStatus?.downloadedAt) return null;
    const date = new Date(csvStatus.downloadedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Order Status
        </span>
        
        {/* Update Button */}
        <button
          onClick={handleUpdate}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#1D9E75] disabled:opacity-50 transition-colors"
          title={lastRefreshMessage || 'Update AWB data from Traze'}
        >
          <RefreshCw
            size={14}
            className={isRefreshing ? 'animate-spin' : ''}
          />
          <span>Update</span>
          {csvStatus?.exists && (
            <span className="text-gray-400 dark:text-gray-500">
              · {formatLastDownload()}
            </span>
          )}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* PO / Order # — multiple entries */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              P.O. / Order #
            </span>
            {!readonly && (
              <button
                onClick={() => setLocalPos([...localPos, ''])}
                className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700"
                title="Add PO Number"
              >
                <span className="text-base leading-none">+</span>
              </button>
            )}
          </div>
          <div className="space-y-1">
            {localPos.map((po, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <input
                  type="text"
                  value={po}
                  onChange={(e) => {
                    const updated = [...localPos]
                    updated[idx] = e.target.value
                    setLocalPos(updated)
                  }}
                  onBlur={() => {
                    const cleaned = localPos.filter(p => p.trim() !== '')
                    const next = cleaned.length > 0 ? cleaned : []
                    setLocalPos(next.length > 0 ? next : [''])
                    onPoNumbersChange(cleaned)
                  }}
                  placeholder="e.g. PO-12345"
                  readOnly={readonly}
                  className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
                />
                {!readonly && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = localPos.filter((_, i) => i !== idx)
                      const final = next.length > 0 ? next : ['']
                      setLocalPos(final)
                      onPoNumbersChange(next.filter(p => p.trim() !== ''))
                    }}
                    className="text-gray-400 hover:text-red-500 text-xs p-1"
                    title="Remove"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* AWB Table - Sin scroll, todo visible */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Air Waybills
              </span>
              {safeAwbs.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {safeAwbs.length} AWB{safeAwbs.length !== 1 ? 's' : ''} · {totalBoxes} boxes
                </span>
              )}
            </div>
            {!readonly && (
              <button
                onClick={addAwb}
                className="text-xs text-[#1D9E75] hover:text-[#178860] font-medium transition-colors flex items-center gap-1"
              >
                <span>+</span>
                <span>Add AWB</span>
              </button>
            )}
          </div>

          {safeAwbs.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded">
              {readonly ? 'No AWBs assigned' : 'No AWBs yet — click + Add AWB'}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {['AWB #', 'Boxes', 'Carrier', 'Ship Date', 'ETA', 'ATA', ''].map(h => (
                    <th key={h} className="text-xs text-gray-400 dark:text-gray-500 font-medium pb-1.5 pr-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {safeAwbs.map((awb, idx) => (
                  <AwbRow
                    key={awb.id}
                    awb={awb}
                    readonly={readonly}
                    onChange={updated => updateAwb(idx, updated)}
                    onDelete={() => deleteAwb(idx)}
                    onClearChanged={() => clearChanged(idx)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
