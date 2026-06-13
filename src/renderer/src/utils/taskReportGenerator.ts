// src/renderer/src/utils/taskReportGenerator.ts
// Generates a self-contained HTML report for a task (inline CSS, no external deps).
// Every section is opt-in via ReportSectionOptions — the export modal lets the
// user pick exactly which task properties go into the PDF.

import type {
  Task, Client, Division, Label, AppUser, Board, Comment, TaskHistoryEntry,
  EmailAttachment, DateType,
} from '../types'

// Which task properties/sections the user wants in the PDF
export interface ReportSectionOptions {
  client: boolean
  division: boolean
  bucket: boolean
  assignees: boolean
  dates: boolean          // dateStart → dateEnd
  taskDates: boolean      // typed date tags (Preparation, Ship, Show day…)
  labels: boolean
  poNumbers: boolean
  awbs: boolean
  description: boolean
  notes: boolean
  subtasks: boolean
  followUps: boolean
  customFields: boolean
  attachmentsList: boolean  // textual index of files in the summary
  emails: boolean           // email summary cards
  comments: boolean
  history: boolean
}

export const DEFAULT_REPORT_SECTIONS: ReportSectionOptions = {
  client: true, division: true, bucket: true, assignees: true,
  dates: true, taskDates: true, labels: true, poNumbers: true, awbs: true,
  description: true, notes: true, subtasks: true, followUps: true,
  customFields: true, attachmentsList: true, emails: true,
  comments: true, history: true,
}

export const REPORT_SECTION_LABELS: Record<keyof ReportSectionOptions, string> = {
  client: 'Client',
  division: 'Division',
  bucket: 'Bucket',
  assignees: 'Assignees',
  dates: 'Date range',
  taskDates: 'Typed dates',
  labels: 'Labels',
  poNumbers: 'PO numbers',
  awbs: 'AWB shipments',
  description: 'Description',
  notes: 'Notes',
  subtasks: 'Subtasks',
  followUps: 'Follow-ups',
  customFields: 'Custom fields',
  attachmentsList: 'Attachment index',
  emails: 'Email summaries',
  comments: 'Comments',
  history: 'Activity log',
}

export interface ReportData {
  task: Task
  client: Client | null
  division: Division | null
  board: Board | null
  labels: Label[]
  users: AppUser[]
  dateTypes: DateType[]
  comments: Comment[]
  history: TaskHistoryEntry[]
  options: ReportSectionOptions
}

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtDate(ts: { toDate(): Date } | null | undefined): string {
  if (!ts) return '—'
  try { return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

function fmtDateTime(ts: { toDate(): Date } | null | undefined): string {
  if (!ts) return '—'
  try { return ts.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}

const STATUS_COLORS: Record<string, string> = {
  todo:       'background:#F1EFE8;color:#444441',
  inprogress: 'background:#FAEEDA;color:#633806',
  review:     'background:#E6F1FB;color:#0C447C',
  done:       'background:#E1F5EE;color:#085041',
}

function formatCustomValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map(v => esc(String(v))).join(', ') || '—'
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No'
  if (typeof value === 'object' && value !== null && 'toDate' in (value as Record<string, unknown>)) {
    return fmtDate(value as { toDate(): Date })
  }
  return esc(String(value))
}

export function generateTaskReportHTML(data: ReportData): string {
  const { task, client, division, board, labels, users, dateTypes, comments, history, options: opt } = data
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })

  const userMap: Record<string, string> = {}
  users.forEach(u => { userMap[u.uid] = u.name })

  const dateTypeMap: Record<string, DateType> = {}
  dateTypes.forEach(dt => { dateTypeMap[dt.key] = dt })

  const assigneeNames = (task.assignees ?? []).map(uid => userMap[uid] ?? uid).join(', ') || '—'
  const statusStyle = STATUS_COLORS[task.status] ?? 'background:#eee;color:#333'
  const priorityColor = task.priority === 'high' ? '#E24B4A' : '#888780'
  const boardColor = board?.color ?? '#1D9E75'

  const subtaskRows = (task.subtasks ?? []).map(st => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;">
        ${st.completed ? '✓' : '○'} ${esc(st.title)}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888;">
        ${st.assigneeUid ? (userMap[st.assigneeUid] ?? st.assigneeUid) : ''}
      </td>
    </tr>`).join('')

  const followUpRows = (task.followUps ?? []).map(fu => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;">
        ${fu.completed ? '✓' : '○'} ${esc(fu.title)}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888;">
        ${fmtDate(fu.createdAt)}
      </td>
    </tr>`).join('')

  const taskDateRows = (task.taskDates ?? []).map(td => {
    const dt = dateTypeMap[td.typeKey]
    const range = td.dateEnd ? `${fmtDate(td.dateStart)} → ${fmtDate(td.dateEnd)}` : fmtDate(td.dateStart)
    return `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(dt?.color ?? '#888')};margin-right:6px;"></span>
        ${esc(dt?.label ?? td.typeKey)}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#444;">${range}</td>
    </tr>`
  }).join('')

  const customProps = board?.customProperties ?? []
  const customFieldRows = Object.entries(task.customFields ?? {})
    .map(([propId, value]) => {
      const prop = customProps.find(p => p.id === propId)
      if (!prop) return ''
      return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888;width:35%;">${esc(prop.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;">${formatCustomValue(value)}</td>
      </tr>`
    }).filter(Boolean).join('')

  const awbRows = (task.awbs ?? []).map(awb => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.number)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.carrier)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${awb.boxes ?? '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.shipDate)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.eta)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.ata)}</td>
    </tr>`).join('')

  const attachmentList = (task.attachments ?? []).map(a => `
    <li style="font-size:13px;padding:4px 0;border-bottom:1px solid #f5f5f5;">
      <span style="color:#1D9E75;font-weight:500;">${esc(a.name)}</span>
      ${a.sharePointRelativePath ? `<span style="font-size:11px;color:#bbb;margin-left:8px;">${esc(a.sharePointRelativePath)}</span>` : ''}
      <span style="font-size:11px;color:#bbb;margin-left:8px;">${esc(a.status ?? '')}</span>
    </li>`
  ).join('')

  const emailAttachments: EmailAttachment[] = task.emailAttachments ?? []
  const emailCards = emailAttachments.map(ea => {
    const innerList = (ea.innerAttachments ?? []).map(ia =>
      `<span style="display:inline-block;background:#f0f0ee;border-radius:4px;padding:2px 8px;font-size:11px;margin:2px 4px 2px 0;color:#555;">${esc(ia.name)}</span>`
    ).join('')
    return `
    <div style="border:1px solid #e8e8e5;border-radius:8px;padding:12px 14px;margin-bottom:10px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${esc(ea.subject) || '(no subject)'}</div>
      <div style="font-size:12px;color:#666;margin-bottom:2px;"><strong>From:</strong> ${esc(ea.from)}</div>
      <div style="font-size:12px;color:#666;margin-bottom:8px;"><strong>Date:</strong> ${fmtDateTime(ea.date)}</div>
      ${ea.bodySnippet ? `<p style="font-size:12px;color:#555;line-height:1.5;margin:0 0 8px;padding:8px;background:#fafaf8;border-radius:4px;white-space:pre-wrap;">${esc(ea.bodySnippet)}</p>` : ''}
      ${(ea.innerAttachments ?? []).length > 0 ? `<div style="margin-top:4px;">${innerList}</div>` : ''}
    </div>`
  }).join('')

  const commentList = comments.slice(0, 50).map(c => `
    <div style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <div style="width:26px;height:26px;border-radius:50%;background:${boardColor};color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${esc(c.authorName?.charAt(0) ?? '?')}
        </div>
        <span style="font-weight:600;font-size:13px;">${esc(c.authorName)}</span>
        <span style="font-size:11px;color:#aaa;">${fmtDateTime(c.createdAt)}</span>
      </div>
      <p style="margin:0 0 0 34px;font-size:13px;color:#444;line-height:1.5;">${esc(c.text)}</p>
    </div>`).join('')

  const historyList = history.slice(0, 20).map(h => `
    <div style="display:flex;gap:10px;padding:5px 0;font-size:12px;color:#666;">
      <span style="color:#aaa;flex-shrink:0;">${fmtDateTime(h.timestamp)}</span>
      <span><strong>${esc(h.userName)}</strong> ${esc(h.action)}${h.field ? ` <em>${esc(h.field)}</em>` : ''}</span>
    </div>`).join('')

  const labelPills = labels.map(l =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${esc(l.color)};color:${esc(l.textColor)};font-size:11px;font-weight:600;margin-right:4px;">${esc(l.name)}</span>`
  ).join('')

  const poEntries = task.poEntries ?? []
  const poList = poEntries.length > 0
    ? poEntries.map(e => e.boxes ? `${e.number} (${e.boxes} boxes)` : e.number).filter(Boolean).join(', ')
    : (task.poNumbers ?? []).filter(Boolean).join(', ') || (task.poNumber ?? '—')

  const completedBlock = task.completed ? `
    <div style="background:#E1F5EE;border-radius:8px;padding:10px 14px;margin-top:12px;font-size:13px;color:#085041;">
      ✓ Completed by <strong>${esc(userMap[task.completedBy ?? ''] ?? task.completedBy ?? '')}</strong> on ${fmtDateTime(task.completedAt)}
    </div>` : ''

  // Properties grid — each cell honors its option toggle
  const props: string[] = []
  if (opt.client) props.push(`<div class="prop"><div class="prop-label">Client</div><div class="prop-value">${esc(client?.name ?? '—')}</div></div>`)
  if (opt.division) props.push(`<div class="prop"><div class="prop-label">Division</div><div class="prop-value">${esc(division?.name ?? '—')}</div></div>`)
  if (opt.bucket) props.push(`<div class="prop"><div class="prop-label">Bucket</div><div class="prop-value">${esc(task.bucket ?? '—')}</div></div>`)
  if (opt.assignees) props.push(`<div class="prop"><div class="prop-label">Assignees</div><div class="prop-value">${esc(assigneeNames)}</div></div>`)
  if (opt.dates) props.push(`<div class="prop"><div class="prop-label">Date Range</div><div class="prop-value">${fmtDate(task.dateStart)} → ${fmtDate(task.dateEnd)}</div></div>`)
  if (opt.poNumbers) props.push(`<div class="prop"><div class="prop-label">PO Numbers</div><div class="prop-value">${esc(poList)}</div></div>`)
  props.push(`<div class="prop"><div class="prop-label">Created</div><div class="prop-value">${fmtDateTime(task.createdAt)}</div></div>`)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Task Report — ${esc(task.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; background: #f7f7f5; }
  .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .header { background: ${boardColor}; color: white; padding: 20px 28px; }
  .header-top { display: flex; justify-content: space-between; align-items: center; font-size: 12px; opacity: .8; margin-bottom: 8px; }
  .task-title { font-size: 22px; font-weight: 700; line-height: 1.3; }
  .body { padding: 24px 28px; }
  .section { margin-bottom: 22px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #aaa; margin-bottom: 8px; }
  .props-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
  .prop { font-size: 13px; }
  .prop-label { font-size: 11px; color: #aaa; margin-bottom: 2px; }
  .prop-value { font-weight: 500; color: #222; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 6px 8px; background: #f7f7f5; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: .04em; }
  .footer { padding: 14px 28px; background: #f7f7f5; text-align: center; font-size: 11px; color: #bbb; border-top: 1px solid #eee; }
  .rich-content p { margin: 0 0 8px; }
  .rich-content ul, .rich-content ol { padding-left: 20px; margin: 0 0 8px; }
  .rich-content h1,.rich-content h2,.rich-content h3 { font-size:14px;font-weight:700;margin:8px 0 4px; }
  @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-top">
      <span>NPD Planner · Elite Flower · Task Report</span>
      <span>${esc(generatedAt)}</span>
    </div>
    <div class="task-title">${esc(task.title)}</div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span style="background:rgba(255,255,255,.25);color:white;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;">${esc(board?.name ?? 'Unknown Board')}</span>
      <span class="badge" style="${statusStyle}">${esc(task.status.toUpperCase())}</span>
      <span style="color:${priorityColor};font-size:12px;font-weight:700;">${task.priority === 'high' ? '⚡ HIGH PRIORITY' : ''}</span>
    </div>
  </div>

  <div class="body">
    ${completedBlock}

    <div class="section">
      <div class="props-grid">
        ${props.join('\n        ')}
      </div>
      ${opt.labels && labelPills ? `<div style="margin-top:10px;">${labelPills}</div>` : ''}
    </div>

    ${opt.taskDates && taskDateRows ? `
    <div class="section">
      <div class="section-title">Dates</div>
      <table><tbody>${taskDateRows}</tbody></table>
    </div>` : ''}

    ${opt.description && task.description ? `
    <div class="section">
      <div class="section-title">Description</div>
      <div style="font-size:13px;color:#444;line-height:1.6;" class="rich-content">${task.description}</div>
    </div>` : ''}

    ${opt.notes && task.notes ? `
    <div class="section">
      <div class="section-title">Notes</div>
      <p style="font-size:13px;color:#444;line-height:1.6;white-space:pre-wrap;">${esc(task.notes)}</p>
    </div>` : ''}

    ${opt.customFields && customFieldRows ? `
    <div class="section">
      <div class="section-title">Custom Fields</div>
      <table><tbody>${customFieldRows}</tbody></table>
    </div>` : ''}

    ${opt.awbs && (task.awbs ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">AWB Shipments</div>
      <table>
        <thead><tr><th>AWB</th><th>Carrier</th><th>Boxes</th><th>Ship Date</th><th>ETA</th><th>ATA</th></tr></thead>
        <tbody>${awbRows}</tbody>
      </table>
    </div>` : ''}

    ${opt.subtasks && (task.subtasks ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">Subtasks (${(task.subtasks ?? []).filter(s => s.completed).length}/${(task.subtasks ?? []).length} done)</div>
      <table><tbody>${subtaskRows}</tbody></table>
    </div>` : ''}

    ${opt.followUps && (task.followUps ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">Follow-ups (${(task.followUps ?? []).filter(f => f.completed).length}/${(task.followUps ?? []).length} done)</div>
      <table><tbody>${followUpRows}</tbody></table>
    </div>` : ''}

    ${opt.attachmentsList && (task.attachments ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">Attachments (${(task.attachments ?? []).length})</div>
      <ul style="margin:0;padding-left:18px;list-style:disc;">${attachmentList}</ul>
    </div>` : ''}

    ${opt.emails && emailAttachments.length > 0 ? `
    <div class="section">
      <div class="section-title">Emails (${emailAttachments.length})</div>
      ${emailCards}
    </div>` : ''}

    ${opt.comments && comments.length > 0 ? `
    <div class="section">
      <div class="section-title">Comments (${comments.length})</div>
      ${commentList}
    </div>` : ''}

    ${opt.history && history.length > 0 ? `
    <div class="section">
      <div class="section-title">Activity Log</div>
      ${historyList}
    </div>` : ''}
  </div>

  <div class="footer">Generated by NPD Planner · Elite Flower · ${esc(generatedAt)}</div>
</div>
</body>
</html>`
}
