// src/renderer/src/components/task/TaskReportModal.tsx
// Task PDF report export — Mode A (embedded) or Mode B (separate + ZIP)

import { useState, useEffect } from 'react'
import {
  X, FileText, Layers, Package, Loader2, CheckCircle2, AlertTriangle,
  FileArchive, ExternalLink, Download, Mail, ChevronRight,
} from 'lucide-react'
import type { Task, AppUser, Board, Label, Client } from '../../types'
import { generateTaskReportHTML } from '../../utils/taskReportGenerator'
import { getComments, getTaskHistory } from '../../lib/firestore'
import { useSharePoint } from '../../hooks/useSharePoint'

interface Props {
  task: Task
  board: Board | null
  users: AppUser[]
  labels: Label[]
  client: Client | null
  onClose: () => void
}

type Step = 'options' | 'generating' | 'done' | 'error'
type AttachMode = 'embedded' | 'separate'

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80).trim()
}

export default function TaskReportModal({ task, board, users, labels, client, onClose }: Props) {
  const { sharePointPath, isElectron } = useSharePoint()
  const [step, setStep] = useState<Step>('options')
  const [attachMode, setAttachMode] = useState<AttachMode>('embedded')

  // Result state
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [zipPath, setZipPath] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [progressStep, setProgressStep] = useState('')

  // Derived attachment counts
  const attCount = (task.attachments ?? []).length
  const emailCount = (task.emailAttachments ?? []).length
  const totalFiles = attCount + emailCount

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleGenerate() {
    if (!isElectron || !sharePointPath) return
    setStep('generating')
    setErrorMsg(null)
    setProgressPct(0)
    setProgressStep('')
    setProgressMsg('Starting…')

    // Subscribe to real-time progress from main process
    const unsubProgress = window.electronAPI.onReportProgress((p) => {
      setProgressPct(p.percent)
      setProgressMsg(p.message)
      setProgressStep(p.step)
    })

    try {
      setProgressMsg('Loading task history and comments…')
      setProgressPct(2)
      const [comments, history] = await Promise.all([
        getComments(task.id),
        getTaskHistory(task.id),
      ])

      setProgressMsg('Building report…')
      setProgressPct(5)
      const summaryHtml = generateTaskReportHTML({ task, client, board, labels, users, comments, history })

      // Resolve absolute paths for attachments
      const resolveAbs = async (relativePath: string): Promise<string> => {
        try {
          return await window.electronAPI.resolveSharePointPath(sharePointPath, relativePath)
        } catch { return '' }
      }

      const attachments: Array<{ name: string; absPath: string }> = []
      for (const a of task.attachments ?? []) {
        if (a.sharePointRelativePath) {
          const abs = await resolveAbs(a.sharePointRelativePath)
          if (abs) attachments.push({ name: a.name, absPath: abs })
        }
      }

      const emailAttachments: Array<{ name: string; absPath: string }> = []
      for (const ea of task.emailAttachments ?? []) {
        if (ea.msgRelativePath) {
          const abs = await resolveAbs(ea.msgRelativePath)
          if (abs) emailAttachments.push({ name: ea.subject || ea.msgRelativePath.split('/').pop() || 'email', absPath: abs })
        }
      }

      // Build output path
      const year = (task.createdAt?.toDate?.()?.getFullYear?.() ?? new Date().getFullYear()).toString()
      const safeClient = sanitize(client?.name ?? 'Unknown')
      const safeTitle = sanitize(task.title)
      const pdfName = `REPORT_${safeTitle}.pdf`
      const outputPdfPath = await window.electronAPI.resolveSharePointPath(
        sharePointPath,
        `${year}/${safeClient}/${safeTitle}/${pdfName}`,
      ).catch(() => '')

      if (!outputPdfPath) throw new Error('Could not resolve SharePoint path for report.')

      setProgressMsg(attachMode === 'embedded'
        ? `Embedding ${totalFiles} attachment${totalFiles !== 1 ? 's' : ''}…`
        : 'Generating summary PDF…')
      setProgressPct(10)

      const reportResult = await window.electronAPI.generateTaskReport({
        summaryHtml,
        includeAttachments: attachMode === 'embedded',
        attachments,
        emailAttachments,
        outputPdfPath,
      })

      unsubProgress()
      if (!reportResult.success) throw new Error(reportResult.error ?? 'PDF generation failed')
      setPdfPath(reportResult.pdfPath ?? outputPdfPath)

      // For separate mode, also create a ZIP right away in the same folder
      if (attachMode === 'separate') {
        setProgressPct(92)
        setProgressMsg('Creating ZIP archive…')
        const zipName = `REPORT_${safeTitle}.zip`
        const zipDest = outputPdfPath.replace(/[^/\\]+$/, zipName)

        const zipResult = await window.electronAPI.createReportZip({
          pdfPath: outputPdfPath,
          attachments,
          emailAttachments,
          destZipPath: zipDest,
        })
        if (zipResult.success && zipResult.zipPath) {
          setZipPath(zipResult.zipPath)
        }
      }

      setProgressPct(100)
      setStep('done')
    } catch (err) {
      unsubProgress()
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setStep('error')
    }
  }

  // Action handlers after generation
  async function handleOpenPdf() {
    if (pdfPath) await window.electronAPI.openReport(pdfPath)
  }

  async function handleOpenZip() {
    if (zipPath) await window.electronAPI.openReport(zipPath)
  }

  async function handleSaveCopyPdf() {
    const dest = await window.electronAPI.saveReportDialog({
      defaultName: `REPORT_${sanitize(task.title)}.pdf`,
      type: 'pdf',
    })
    if (dest && pdfPath) {
      await window.electronAPI.copyFile(pdfPath, dest, false)
    }
  }

  async function handleSaveCopyZip() {
    const dest = await window.electronAPI.saveReportDialog({
      defaultName: `REPORT_${sanitize(task.title)}.zip`,
      type: 'zip',
    })
    if (dest && zipPath) {
      await window.electronAPI.copyFile(zipPath, dest, false)
    }
  }

  async function handleCreateZipManual() {
    if (!pdfPath || !sharePointPath) return
    setStep('generating')
    setProgressMsg('Creating ZIP archive…')
    try {
      const attachments: Array<{ name: string; absPath: string }> = []
      for (const a of task.attachments ?? []) {
        if (a.sharePointRelativePath) {
          const abs = await window.electronAPI.resolveSharePointPath(sharePointPath, a.sharePointRelativePath).catch(() => '')
          if (abs) attachments.push({ name: a.name, absPath: abs })
        }
      }
      const emailAttachments: Array<{ name: string; absPath: string }> = []
      for (const ea of task.emailAttachments ?? []) {
        if (ea.msgRelativePath) {
          const abs = await window.electronAPI.resolveSharePointPath(sharePointPath, ea.msgRelativePath).catch(() => '')
          if (abs) emailAttachments.push({ name: ea.subject || 'email', absPath: abs })
        }
      }
      const zipDest = pdfPath.replace(/[^/\\]+$/, `REPORT_${sanitize(task.title)}.zip`)
      const r = await window.electronAPI.createReportZip({ pdfPath, attachments, emailAttachments, destZipPath: zipDest })
      if (r.success && r.zipPath) setZipPath(r.zipPath)
      setStep('done')
    } catch (err) {
      setErrorMsg(String(err))
      setStep('error')
    }
  }

  async function handleSendEmail() {
    const fileLoc = zipPath || pdfPath || ''
    const subject = `Report: ${task.title}`
    const body = `Please find the task report attached.\n\nFile location: ${fileLoc}\n\nTask: ${task.title}\nClient: ${client?.name ?? '—'}`
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    await window.electronAPI.openExternal(mailto)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[460px] rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
            <FileText size={18} className="text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Generate Task Report</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{task.title}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Step: options */}
        {step === 'options' && (
          <div className="px-5 py-5 space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {totalFiles > 0
                ? `This task has ${attCount} file${attCount !== 1 ? 's' : ''}${emailCount > 0 ? ` and ${emailCount} email${emailCount !== 1 ? 's' : ''}` : ''}.`
                : 'This task has no attachments.'}
              {' '}Choose how to include them:
            </p>

            {/* Mode A */}
            <button
              onClick={() => setAttachMode('embedded')}
              className={`w-full rounded-xl border-2 p-4 text-left transition-all ${attachMode === 'embedded' ? 'border-green-500 bg-green-50 dark:bg-green-900/15' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${attachMode === 'embedded' ? 'bg-green-100 dark:bg-green-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  <Layers size={16} className={attachMode === 'embedded' ? 'text-green-600' : 'text-gray-400'} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Include attachments in PDF</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    One single PDF. Each file gets its own page: images embedded, Excel as tables, emails as HTML, PDFs as screenshots.
                  </p>
                </div>
                {attachMode === 'embedded' && <CheckCircle2 size={16} className="ml-auto shrink-0 text-green-500 mt-0.5" />}
              </div>
            </button>

            {/* Mode B */}
            <button
              onClick={() => setAttachMode('separate')}
              className={`w-full rounded-xl border-2 p-4 text-left transition-all ${attachMode === 'separate' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/15' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${attachMode === 'separate' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  <Package size={16} className={attachMode === 'separate' ? 'text-blue-600' : 'text-gray-400'} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Attachments separately (ZIP)</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    PDF with summary only + all original files bundled in a ZIP:
                    <span className="block mt-1 font-mono text-[10px] bg-gray-100 dark:bg-gray-800 rounded px-2 py-0.5">
                      📦 Report.zip / Report.pdf + Attachments/ files...
                    </span>
                  </p>
                </div>
                {attachMode === 'separate' && <CheckCircle2 size={16} className="ml-auto shrink-0 text-blue-500 mt-0.5" />}
              </div>
            </button>

            {!isElectron && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Report generation requires the desktop app.
              </p>
            )}

            <button
              onClick={handleGenerate}
              disabled={!isElectron || !sharePointPath}
              className="w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <FileText size={15} />
              Generate Report
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Step: generating */}
        {step === 'generating' && (
          <div className="px-5 py-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-green-500 shrink-0" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Generating report…</p>
              <span className="ml-auto text-sm font-bold text-green-600 dark:text-green-400 tabular-nums">
                {progressPct}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="relative h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Current step pill + message */}
            <div className="flex items-start gap-2 min-h-[36px]">
              {progressStep && (
                <span className="shrink-0 rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {progressStep}
                </span>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{progressMsg}</p>
            </div>

            {/* Attachment counter */}
            {attachMode === 'embedded' && totalFiles > 0 && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Attachments</span>
                  <span className="tabular-nums">
                    {Math.min(
                      Math.max(0, Math.round(((progressPct - 10) / 75) * totalFiles)),
                      totalFiles
                    )} / {totalFiles}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(0, ((progressPct - 10) / 75) * 100))}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div className="px-5 py-5 space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 size={18} />
              <span className="text-sm font-semibold">Report saved to SharePoint ✓</span>
            </div>

            {/* PDF actions */}
            {pdfPath && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                  <FileText size={13} className="text-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate flex-1">
                    {pdfPath.split(/[/\\]/).pop()}
                  </span>
                </div>
                <div className="flex divide-x divide-gray-200 dark:divide-gray-700">
                  <ActionBtn icon={<ExternalLink size={12} />} label="Open" onClick={handleOpenPdf} />
                  <ActionBtn icon={<Download size={12} />} label="Save copy…" onClick={handleSaveCopyPdf} />
                  <ActionBtn icon={<Mail size={12} />} label="Send by email" onClick={handleSendEmail} />
                </div>
              </div>
            )}

            {/* ZIP actions */}
            {zipPath && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
                  <FileArchive size={13} className="text-blue-500 shrink-0" />
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate flex-1">
                    {zipPath.split(/[/\\]/).pop()}
                  </span>
                </div>
                <div className="flex divide-x divide-gray-200 dark:divide-gray-700">
                  <ActionBtn icon={<ExternalLink size={12} />} label="Open ZIP" onClick={handleOpenZip} />
                  <ActionBtn icon={<Download size={12} />} label="Save copy…" onClick={handleSaveCopyZip} />
                </div>
              </div>
            )}

            {/* Create ZIP option for embedded mode */}
            {attachMode === 'embedded' && !zipPath && totalFiles > 0 && pdfPath && (
              <button
                onClick={handleCreateZipManual}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-2 text-xs text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
              >
                <FileArchive size={13} />
                Also create ZIP with original files
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Step: error */}
        {step === 'error' && (
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Report generation failed</p>
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 break-all">{errorMsg}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setStep('options'); setErrorMsg(null) }}
                className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-800 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-red-100 dark:bg-red-900/30 py-2 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Small action button inside result cards ────────────────────────────────
function ActionBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      {icon}
      {label}
    </button>
  )
}
