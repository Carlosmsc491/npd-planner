// src/renderer/src/components/task/TaskReportModal.tsx
// Task PDF report export.
// 1. Pick exactly which task properties go into the report (all on by default)
// 2. Pick attachments VISUALLY (thumbnails, not a list), grouped by type
// 3. Choose embedded vs separate (ZIP) — as before
// The PDF orders attachments by type with a divider page per section:
// Photos → Emails → PDF Documents → Word Documents → Excel Files → Other.

import { useState, useEffect, useMemo } from 'react'
import {
  X, FileText, Layers, Package, Loader2, CheckCircle2, AlertTriangle,
  FileArchive, ExternalLink, Download, Mail, ChevronRight, Image as ImageIcon,
  FileSpreadsheet, File as FileIcon, CheckSquare, Square,
} from 'lucide-react'
import type { Task, AppUser, Board, Label, Client, Division } from '../../types'
import {
  generateTaskReportHTML, DEFAULT_REPORT_SECTIONS, REPORT_SECTION_LABELS,
  type ReportSectionOptions,
} from '../../utils/taskReportGenerator'
import { getComments, getTaskHistory, getDivisionById } from '../../lib/firestore'
import { useDateTypeStore } from '../../store/dateTypeStore'
import { useSharePoint } from '../../hooks/useSharePoint'

interface Props {
  task: Task
  board: Board | null
  users: AppUser[]
  labels: Label[]
  client: Client | null
  division?: Division | null   // optional — fetched by id when not provided
  onClose: () => void
}

type Step = 'options' | 'generating' | 'done' | 'error'
type AttachMode = 'embedded' | 'separate'

// ── Attachment typing for the visual picker ────────────────────────────────

type FileKind = 'image' | 'email' | 'pdf' | 'word' | 'excel' | 'other'

interface PickerFile {
  key: string
  name: string
  relPath: string
  isEmailAttachment: boolean   // came from task.emailAttachments
  kind: FileKind
  absPath: string | null
  thumb: string | null         // data URL for images
  selected: boolean
}

const KIND_ORDER: FileKind[] = ['image', 'email', 'pdf', 'word', 'excel', 'other']
const KIND_LABELS: Record<FileKind, string> = {
  image: 'Photos',
  email: 'Emails',
  pdf:   'PDF Documents',
  word:  'Word Documents',
  excel: 'Excel Files',
  other: 'Other Files',
}

function kindOf(name: string, isEmail: boolean): FileKind {
  if (isEmail) return 'email'
  const e = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(e)) return 'image'
  if (['msg', 'eml'].includes(e)) return 'email'
  if (e === 'pdf') return 'pdf'
  if (['doc', 'docx', 'rtf'].includes(e)) return 'word'
  if (['xls', 'xlsx', 'xlsm', 'csv'].includes(e)) return 'excel'
  return 'other'
}

function mimeOf(name: string): string {
  const e = name.split('.').pop()?.toLowerCase() ?? ''
  if (e === 'png') return 'image/png'
  if (e === 'gif') return 'image/gif'
  if (e === 'webp') return 'image/webp'
  if (e === 'bmp') return 'image/bmp'
  return 'image/jpeg'
}

function kindIcon(kind: FileKind) {
  switch (kind) {
    case 'image': return <ImageIcon size={22} className="text-purple-500" />
    case 'email': return <Mail size={22} className="text-sky-500" />
    case 'pdf':   return <FileText size={22} className="text-red-500" />
    case 'word':  return <FileText size={22} className="text-blue-600" />
    case 'excel': return <FileSpreadsheet size={22} className="text-green-600" />
    default:      return <FileIcon size={22} className="text-gray-400" />
  }
}

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80).trim()
}

// Sections without data are disabled in the picker — compute availability
function sectionHasData(key: keyof ReportSectionOptions, task: Task): boolean {
  switch (key) {
    case 'division':       return !!task.divisionId
    case 'taskDates':      return (task.taskDates ?? []).length > 0
    case 'labels':         return (task.labelIds ?? []).length > 0
    case 'poNumbers':      return !!(task.poNumber || (task.poNumbers ?? []).length || (task.poEntries ?? []).length)
    case 'awbs':           return (task.awbs ?? []).length > 0
    case 'description':    return !!task.description
    case 'notes':          return !!task.notes
    case 'subtasks':       return (task.subtasks ?? []).length > 0
    case 'followUps':      return (task.followUps ?? []).length > 0
    case 'customFields':   return Object.keys(task.customFields ?? {}).length > 0
    case 'attachmentsList': return (task.attachments ?? []).length > 0
    case 'emails':         return (task.emailAttachments ?? []).length > 0
    default:               return true   // client, bucket, assignees, dates, comments, history
  }
}

export default function TaskReportModal({ task, board, users, labels, client, division: divisionProp, onClose }: Props) {
  const { sharePointPath, isElectron } = useSharePoint()
  const { dateTypes } = useDateTypeStore()
  const [step, setStep] = useState<Step>('options')
  const [attachMode, setAttachMode] = useState<AttachMode>('embedded')
  const [division, setDivision] = useState<Division | null>(divisionProp ?? null)

  // Section toggles — everything on by default; data-less sections disabled
  const [sections, setSections] = useState<ReportSectionOptions>({ ...DEFAULT_REPORT_SECTIONS })

  // Visual attachment picker state
  const [files, setFiles] = useState<PickerFile[]>([])
  const [loadingThumbs, setLoadingThumbs] = useState(false)

  // Result state
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [zipPath, setZipPath] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [progressStep, setProgressStep] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Division fallback (TaskCard path doesn't have divisions loaded)
  useEffect(() => {
    if (divisionProp !== undefined && divisionProp !== null) { setDivision(divisionProp); return }
    if (task.divisionId) {
      getDivisionById(task.divisionId).then(setDivision)
    }
  }, [task.divisionId, divisionProp])

  // Build the picker list and load image thumbnails
  useEffect(() => {
    if (!isElectron || !sharePointPath) return
    const spPath = sharePointPath  // narrowed copy for the async closure
    let cancelled = false

    async function load() {
      setLoadingThumbs(true)
      const list: PickerFile[] = []

      for (const a of task.attachments ?? []) {
        if (!a.sharePointRelativePath) continue
        list.push({
          key: `f-${a.id}`,
          name: a.name,
          relPath: a.sharePointRelativePath,
          isEmailAttachment: false,
          kind: kindOf(a.name, false),
          absPath: null,
          thumb: null,
          selected: true,
        })
      }
      for (const ea of task.emailAttachments ?? []) {
        if (!ea.msgRelativePath) continue
        list.push({
          key: `e-${ea.id}`,
          name: ea.subject || ea.msgRelativePath.split('/').pop() || 'email',
          relPath: ea.msgRelativePath,
          isEmailAttachment: true,
          kind: 'email',
          absPath: null,
          thumb: null,
          selected: true,
        })
      }

      // Resolve absolute paths + thumbnails for images
      for (const f of list) {
        if (cancelled) return
        try {
          f.absPath = await window.electronAPI.resolveSharePointPath(spPath, f.relPath)
        } catch { f.absPath = null }
        if (f.kind === 'image' && f.absPath) {
          try {
            const b64 = await window.electronAPI.readFileBase64(f.absPath)
            if (b64) f.thumb = `data:${mimeOf(f.name)};base64,${b64}`
          } catch { /* tile falls back to icon */ }
        }
        if (!cancelled) setFiles([...list])
      }
      if (!cancelled) setLoadingThumbs(false)
    }

    void load()
    return () => { cancelled = true }
  }, [task.id, isElectron, sharePointPath])

  // Picker files grouped and ordered by type
  const grouped = useMemo(() => {
    const map = new Map<FileKind, PickerFile[]>()
    for (const kind of KIND_ORDER) map.set(kind, [])
    for (const f of files) map.get(f.kind)!.push(f)
    return [...map.entries()].filter(([, list]) => list.length > 0)
  }, [files])

  const selectedFiles = files.filter(f => f.selected)
  const totalFiles = files.length

  function toggleFile(key: string) {
    setFiles(prev => prev.map(f => f.key === key ? { ...f, selected: !f.selected } : f))
  }

  function toggleGroup(kind: FileKind, value: boolean) {
    setFiles(prev => prev.map(f => f.kind === kind ? { ...f, selected: value } : f))
  }

  function toggleSection(key: keyof ReportSectionOptions) {
    setSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Selected files in PDF section order, each tagged with its group label
  function orderedSelection(): Array<{ name: string; absPath: string; group: string; isEmailAttachment: boolean }> {
    const out: Array<{ name: string; absPath: string; group: string; isEmailAttachment: boolean }> = []
    for (const kind of KIND_ORDER) {
      for (const f of selectedFiles) {
        if (f.kind === kind && f.absPath) {
          out.push({ name: f.name, absPath: f.absPath, group: KIND_LABELS[kind], isEmailAttachment: f.isEmailAttachment })
        }
      }
    }
    return out
  }

  async function handleGenerate() {
    if (!isElectron || !sharePointPath) return
    setStep('generating')
    setErrorMsg(null)
    setProgressPct(0)
    setProgressStep('')
    setProgressMsg('Starting…')

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
      const summaryHtml = generateTaskReportHTML({
        task, client, division, board, labels, users, dateTypes,
        comments: sections.comments ? comments : [],
        history: sections.history ? history : [],
        options: sections,
      })

      const ordered = orderedSelection()
      const attachments = ordered.filter(o => !o.isEmailAttachment).map(({ name, absPath, group }) => ({ name, absPath, group }))
      const emailAttachments = ordered.filter(o => o.isEmailAttachment).map(({ name, absPath, group }) => ({ name, absPath, group }))

      const year = (task.createdAt?.toDate?.()?.getFullYear?.() ?? new Date().getFullYear()).toString()
      const safeClient = sanitize(client?.name ?? 'Unknown')
      const safeTitle = sanitize(task.title)
      const pdfName = `REPORT_${safeTitle}.pdf`
      const outputPdfPath = await window.electronAPI.resolveSharePointPath(
        sharePointPath,
        `${year}/${safeClient}/${safeTitle}/${pdfName}`,
      ).catch(() => '')

      if (!outputPdfPath) throw new Error('Could not resolve SharePoint path for report.')

      const selCount = ordered.length
      setProgressMsg(attachMode === 'embedded'
        ? `Embedding ${selCount} attachment${selCount !== 1 ? 's' : ''}…`
        : 'Generating summary PDF…')
      setProgressPct(10)

      // IMPORTANT: send a single ordered array so the PDF keeps type order —
      // attachments first array, then emails would break the grouping, so we
      // pass everything through `attachments` already interleaved by group.
      const reportResult = await window.electronAPI.generateTaskReport({
        summaryHtml,
        includeAttachments: attachMode === 'embedded',
        attachments: ordered.map(({ name, absPath, group }) => ({ name, absPath, group })),
        emailAttachments: [],
        outputPdfPath,
      })

      unsubProgress()
      if (!reportResult.success) throw new Error(reportResult.error ?? 'PDF generation failed')
      setPdfPath(reportResult.pdfPath ?? outputPdfPath)

      if (attachMode === 'separate' && ordered.length > 0) {
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
      const ordered = orderedSelection()
      const zipDest = pdfPath.replace(/[^/\\]+$/, `REPORT_${sanitize(task.title)}.zip`)
      const r = await window.electronAPI.createReportZip({
        pdfPath,
        attachments: ordered.filter(o => !o.isEmailAttachment).map(({ name, absPath }) => ({ name, absPath })),
        emailAttachments: ordered.filter(o => o.isEmailAttachment).map(({ name, absPath }) => ({ name, absPath })),
        destZipPath: zipDest,
      })
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

  const sectionKeys = Object.keys(REPORT_SECTION_LABELS) as (keyof ReportSectionOptions)[]

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-full w-[620px] flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
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
          <div className="overflow-y-auto px-5 py-5 space-y-5">
            {/* 1 — Report sections */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                1 · What goes in the report
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {sectionKeys.map((key) => {
                  const hasData = sectionHasData(key, task)
                  const checked = sections[key] && hasData
                  return (
                    <button
                      key={key}
                      disabled={!hasData}
                      onClick={() => toggleSection(key)}
                      title={hasData ? '' : 'This task has no data for this section'}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${
                        !hasData
                          ? 'border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          : checked
                          ? 'border-green-400 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {checked ? <CheckSquare size={13} className="shrink-0" /> : <Square size={13} className="shrink-0" />}
                      <span className="truncate">{REPORT_SECTION_LABELS[key]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2 — Visual attachment picker */}
            {totalFiles > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    2 · Attachments ({selectedFiles.length}/{totalFiles} selected)
                  </p>
                  {loadingThumbs && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                      <Loader2 size={10} className="animate-spin" /> loading previews…
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {grouped.map(([kind, list]) => {
                    const allSel = list.every(f => f.selected)
                    return (
                      <div key={kind}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                            {kindIcon(kind)} {KIND_LABELS[kind]} ({list.length})
                          </span>
                          <button
                            onClick={() => toggleGroup(kind, !allSel)}
                            className="text-[10px] font-medium text-green-600 hover:underline dark:text-green-400"
                          >
                            {allSel ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {list.map((f) => (
                            <button
                              key={f.key}
                              onClick={() => toggleFile(f.key)}
                              title={f.name}
                              className={`relative overflow-hidden rounded-lg border-2 text-left transition-all ${
                                f.selected
                                  ? 'border-green-500 ring-1 ring-green-500/30'
                                  : 'border-gray-200 dark:border-gray-700 opacity-60 hover:opacity-90'
                              }`}
                            >
                              {/* Visual */}
                              {f.kind === 'image' && f.thumb ? (
                                <img src={f.thumb} alt={f.name} className="h-20 w-full object-cover" />
                              ) : (
                                <div className="flex h-20 w-full flex-col items-center justify-center gap-1 bg-gray-50 dark:bg-gray-800 px-1">
                                  {kindIcon(f.kind)}
                                  <span className="w-full truncate text-center text-[9px] text-gray-500 dark:text-gray-400">
                                    {f.name.split('.').pop()?.toUpperCase()}
                                  </span>
                                </div>
                              )}
                              {/* Name strip */}
                              <div className="truncate bg-white px-1.5 py-1 text-[9px] text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                                {f.name}
                              </div>
                              {/* Check overlay */}
                              {f.selected && (
                                <span className="absolute right-1 top-1 rounded-full bg-green-500 p-0.5 text-white shadow">
                                  <CheckCircle2 size={12} />
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 3 — Attachment mode */}
            {selectedFiles.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  3 · How to include them
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAttachMode('embedded')}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${attachMode === 'embedded' ? 'border-green-500 bg-green-50 dark:bg-green-900/15' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={15} className={attachMode === 'embedded' ? 'text-green-600' : 'text-gray-400'} />
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">Inside the PDF</p>
                      {attachMode === 'embedded' && <CheckCircle2 size={13} className="ml-auto text-green-500" />}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      One PDF, sections by type: photos, emails, PDFs, Word…
                    </p>
                  </button>
                  <button
                    onClick={() => setAttachMode('separate')}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${attachMode === 'separate' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/15' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Package size={15} className={attachMode === 'separate' ? 'text-blue-600' : 'text-gray-400'} />
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">Separate (ZIP)</p>
                      {attachMode === 'separate' && <CheckCircle2 size={13} className="ml-auto text-blue-500" />}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      Summary PDF + original files bundled in a ZIP
                    </p>
                  </button>
                </div>
              </div>
            )}

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
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-green-500 shrink-0" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Generating report…</p>
              <span className="ml-auto text-sm font-bold text-green-600 dark:text-green-400 tabular-nums">
                {progressPct}%
              </span>
            </div>

            <div className="relative h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="flex items-start gap-2 min-h-[36px]">
              {progressStep && (
                <span className="shrink-0 rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {progressStep}
                </span>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{progressMsg}</p>
            </div>

            {attachMode === 'embedded' && selectedFiles.length > 0 && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Attachments</span>
                  <span className="tabular-nums">
                    {Math.min(
                      Math.max(0, Math.round(((progressPct - 10) / 75) * selectedFiles.length)),
                      selectedFiles.length
                    )} / {selectedFiles.length}
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

            {attachMode === 'embedded' && !zipPath && selectedFiles.length > 0 && pdfPath && (
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
