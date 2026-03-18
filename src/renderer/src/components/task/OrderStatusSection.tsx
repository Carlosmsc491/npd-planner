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

      {history.length === 0 ? (
        <p className="text-xs text-gray-400">No history yet.</p>
      ) : (
        <div className="space-y-2">
          {[...history].reverse().map((entry, idx) => (
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

  const handleField = (field: keyof AwbEntry, value: string | number) => {
    onChange({ ...awb, [field]: value });
  };

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 last:border-0 group">
      {/* AWB Number */}
      <td className="py-2 pr-2">
        {readonly ? (
          <span className="text-sm font-mono text-gray-800 dark:text-gray-100">{awb.number}</span>
        ) : (
          <input
            type="text"
            value={awb.number}
            onChange={e => handleField('number', e.target.value)}
            placeholder="369-0000-0000"
            className="w-36 text-sm font-mono bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-[#1D9E75] outline-none text-gray-800 dark:text-gray-100 placeholder-gray-300"
          />
        )}
      </td>

      {/* Boxes */}
      <td className="py-2 pr-3">
        {readonly ? (
          <span className="text-sm text-gray-700 dark:text-gray-300">{awb.boxes}</span>
        ) : (
          <input
            type="number"
            min={0}
            value={awb.boxes || ''}
            onChange={e => handleField('boxes', parseInt(e.target.value) || 0)}
            placeholder="0"
            className="w-16 text-sm bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-[#1D9E75] outline-none text-gray-800 dark:text-gray-100 placeholder-gray-300"
          />
        )}
      </td>

      {/* Carrier (auto-filled from CSV) */}
      <td className="py-2 pr-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {awb.carrier || '—'}
        </span>
      </td>

      {/* Ship Date (auto-filled from CSV) */}
      <td className="py-2 pr-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {awb.shipDate || '—'}
        </span>
      </td>

      {/* ETA */}
      <td className="py-2 pr-3 relative">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {awb.eta || '—'}
          </span>
          {awb.etaChanged && (
            <div className="relative">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                title="ETA changed — click to see history"
              >
                <span>⚠</span>
                <span>changed</span>
              </button>
              {showHistory && (
                <EtaHistoryPopover
                  awbNumber={awb.number}
                  history={awb.etaHistory}
                  onClose={() => setShowHistory(false)}
                />
              )}
            </div>
          )}
        </div>
      </td>

      {/* ATA (auto-filled from CSV) */}
      <td className="py-2 pr-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {awb.ata || '—'}
        </span>
      </td>

      {/* Actions */}
      {!readonly && (
        <td className="py-2 text-right">
          <button
            onClick={onDelete}
            className="text-gray-300 hover:text-red-400 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-sm"
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
  taskId:           string
  poNumber:         string
  awbs:             AwbEntry[]
  onPoNumberChange: (value: string) => void
  onAwbsChange:     (awbs: AwbEntry[]) => void
  readonly?:        boolean
  csvStatus?: {
    exists:       boolean
    downloadedAt: string | null
  }
  trazeConnected?:  boolean
  trazeLoading?:    boolean
  onShowTrazeLogin?: () => void
  onDownloadNow?:   () => void
}

export function OrderStatusSection({
  taskId,
  poNumber,
  awbs,
  onPoNumberChange,
  onAwbsChange,
  readonly = false,
  csvStatus,
  trazeConnected = false,
  trazeLoading = false,
  onShowTrazeLogin,
  onDownloadNow,
}: OrderStatusSectionProps) {

  // taskId used for future per-task save logic
  void taskId;

  const addAwb = () => {
    const newEntry: AwbEntry = {
      id:            nanoid(),
      number:        '',
      boxes:         0,
      carrier:       null,
      shipDate:      null,
      eta:           null,
      ata:           null,
      etaChanged:    false,
      lastCheckedAt: null,
      etaHistory:    [],
    };
    onAwbsChange([...awbs, newEntry]);
  };

  const updateAwb = (index: number, updated: AwbEntry) => {
    const next = [...awbs];
    next[index] = updated;
    onAwbsChange(next);
  };

  const deleteAwb = (index: number) => {
    onAwbsChange(awbs.filter((_, i) => i !== index));
  };

  const clearChanged = (index: number) => {
    const next = [...awbs];
    next[index] = { ...next[index], etaChanged: false };
    onAwbsChange(next);
  };

  const totalBoxes = awbs.reduce((sum, a) => sum + (a.boxes || 0), 0);

  const formatLastDownload = () => {
    if (!csvStatus?.downloadedAt) return null;
    return new Date(csvStatus.downloadedAt).toLocaleString('en-US', {
      month: '2-digit', day: '2-digit',
      hour:  '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Order Status
        </span>
        {/* Traze connection status */}
        <div className="flex items-center gap-2">
          {trazeConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Traze connected
              {formatLastDownload() && (
                <span className="text-gray-400 dark:text-gray-500">
                  · {formatLastDownload()}
                </span>
              )}
              <button
                onClick={onDownloadNow}
                disabled={trazeLoading}
                title="Refresh from Traze"
                className="ml-1 text-gray-400 hover:text-[#1D9E75] disabled:opacity-50 transition-colors"
              >
                <span
                  className={trazeLoading ? 'inline-block animate-spin' : 'inline-block'}
                  style={{ display: 'inline-block' }}
                >
                  ↻
                </span>
              </button>
            </span>
          ) : (
            <button
              onClick={onShowTrazeLogin}
              disabled={trazeLoading}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1D9E75] disabled:opacity-50 transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${trazeLoading ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'}`} />
              {trazeLoading ? 'Connecting…' : 'Connect Traze'}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* PO / Order Number */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">
            PO / Order #
          </label>
          {readonly ? (
            <span className="text-sm text-gray-800 dark:text-gray-100">
              {poNumber || '—'}
            </span>
          ) : (
            <input
              type="text"
              value={poNumber}
              onChange={e => onPoNumberChange(e.target.value)}
              placeholder="PO12345"
              className="flex-1 text-sm bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-[#1D9E75] outline-none text-gray-800 dark:text-gray-100 placeholder-gray-300 py-0.5"
            />
          )}
        </div>

        {/* AWB Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Air Waybills
              </span>
              {awbs.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {awbs.length} AWB{awbs.length !== 1 ? 's' : ''} · {totalBoxes} boxes total
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

          {awbs.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded">
              {readonly ? 'No AWBs assigned' : 'No AWBs yet — click + Add AWB'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    {['AWB #', 'Boxes', 'Carrier', 'Ship Date', 'ETA', 'ATA', ''].map(h => (
                      <th key={h} className="text-xs text-gray-400 dark:text-gray-500 font-medium pb-1.5 pr-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {awbs.map((awb, idx) => (
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
