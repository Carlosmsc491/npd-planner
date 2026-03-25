import { useMemo, useEffect, useState } from 'react'
import { Plane, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { Task } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type FlightStatus = 'scheduled' | 'flying' | 'arrived' | 'unknown'

interface FlightRow {
  taskId: string
  boardId: string
  taskTitle: string
  poNumber: string
  awbNumber: string
  eta: string | null
  ata: string | null
  status: FlightStatus
  delayed: boolean
  previousEta: string | null
}

function fmtDate(val: string | null): string {
  if (!val) return '—'
  if (val.includes('1900')) return '—'
  const parts = val.trim().split(' ')
  const [m, d] = parts[0].split('/')
  let result = `${m}/${d}`
  if (parts[1]) {
    const [hh, mm] = parts[1].split(':').map(Number)
    const ampm = hh >= 12 ? 'PM' : 'AM'
    const h12 = hh % 12 === 0 ? 12 : hh % 12
    result += ` ${h12}:${String(mm).padStart(2, '0')} ${ampm}`
  }
  return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFlightDate(val: string | null): Date | null {
  if (!val) return null
  const parts = val.trim().split(' ')
  const [m, d, y] = parts[0].split('/')
  if (!m || !d || !y) return null
  const [hh, mm] = parts[1] ? parts[1].split(':') : ['0', '0']
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm))
}

function computeStatus(eta: string | null, ata: string | null): FlightStatus {
  const now = new Date()
  const etaDate = parseFlightDate(eta)
  const ataDate = parseFlightDate(ata)

  // Arrived: ATA exists and has passed
  if (ataDate && ataDate <= now) return 'arrived'

  // Prefer ATA for flying check if it's in the future, else fall back to ETA
  const refDate = ataDate ?? etaDate
  if (!refDate) return 'unknown'

  const diffMs = refDate.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours <= 0) return 'arrived'       // ref time passed
  if (diffHours <= 1) return 'flying'        // within 1 hour
  return 'scheduled'                          // more than 1 hour away
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FlightStatus }) {
  if (status === 'arrived') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs font-medium">
      <CheckCircle2 size={11} /> Arrived
    </span>
  )
  if (status === 'flying') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 text-xs font-medium animate-pulse">
      <Plane size={11} /> Flying
    </span>
  )
  if (status === 'scheduled') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 text-xs font-medium">
      <Clock size={11} /> Scheduled
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 px-2 py-0.5 text-xs font-medium">
      —
    </span>
  )
}

// ─── Sort order ───────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<FlightStatus, number> = {
  flying: 0,
  scheduled: 1,
  arrived: 2,
  unknown: 3,
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  tasks: Task[]
  onTaskClick: (boardId: string) => void
}

export default function FlightStatusPanel({ tasks, onTaskClick }: Props) {
  // Tick every 60s to re-compute statuses
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo<FlightRow[]>(() => {
    const result: FlightRow[] = []
    for (const task of tasks) {
      if (!task.awbs || task.awbs.length === 0) continue
      for (const awb of task.awbs) {
        if (!awb.eta && !awb.ata) continue  // skip AWBs with no dates
        const status = computeStatus(awb.eta, awb.ata)
        // Don't show arrived flights older than 7 days
        if (status === 'arrived') {
          const ataDate = parseFlightDate(awb.ata)
          if (ataDate) {
            const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            if (ataDate < cutoff) continue
          }
        }
        const lastHistory = awb.etaHistory?.length > 0
          ? awb.etaHistory[awb.etaHistory.length - 1]
          : null
        result.push({
          taskId: task.id,
          boardId: task.boardId,
          taskTitle: task.title,
          poNumber: task.poNumber,
          awbNumber: awb.number,
          eta: awb.eta,
          ata: awb.ata,
          status,
          delayed: awb.etaChanged,
          previousEta: lastHistory?.previousEta ?? null,
        })
      }
    }
    return result.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  }, [tasks])  // tick not in deps — re-sort only when tasks change; status badge re-renders via tick

  if (rows.length === 0) {
    return (
      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-2">
          <Plane size={13} />
          Flight Status
        </h2>
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-8 flex flex-col items-center justify-center text-center">
          <Plane size={28} className="text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No active flights</p>
          <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
            Add an AWB with ETA or ATA to a task to track it here
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-2">
        <Plane size={13} />
        Flight Status
      </h2>
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Task</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">PO</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">AWB</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">ETA</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">ATA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.taskId}-${row.awbNumber}`}
                onClick={() => onTaskClick(row.boardId)}
                className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors ${
                  i < rows.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/50' : ''
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100 max-w-[180px] truncate">{row.taskTitle}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{row.poNumber || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 font-mono text-xs">{row.awbNumber}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <StatusBadge status={row.status} />
                    {row.delayed && row.previousEta && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={9} />
                        was {row.previousEta}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                  {fmtDate(row.eta)}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                  {fmtDate(row.ata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
