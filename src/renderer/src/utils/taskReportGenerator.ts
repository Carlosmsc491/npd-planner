// src/renderer/src/utils/taskReportGenerator.ts
// Generates a self-contained HTML report for a task (inline CSS, no external deps)

import type { Task, Client, Label, AppUser, Board, Comment, TaskHistoryEntry } from '../types'

export interface ReportData {
  task: Task
  client: Client | null
  board: Board | null
  labels: Label[]
  users: AppUser[]
  comments: Comment[]
  history: TaskHistoryEntry[]
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

export function generateTaskReportHTML(data: ReportData): string {
  const { task, client, board, labels, users, comments, history } = data
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })

  const userMap: Record<string, string> = {}
  users.forEach(u => { userMap[u.uid] = u.name })

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

  const awbRows = (task.awbs ?? []).map(awb => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.number)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.carrier)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${awb.boxes ?? '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.shipDate)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.eta)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">${esc(awb.ata)}</td>
    </tr>`).join('')

  const attachmentList = (task.attachments ?? []).map(a =>
    `<li style="font-size:13px;padding:3px 0;color:#1D9E75;">${esc(a.name)}</li>`
  ).join('')

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

  const poList = (task.poNumbers ?? []).filter(Boolean).join(', ') || (task.poNumber ?? '—')

  const completedBlock = task.completed ? `
    <div style="background:#E1F5EE;border-radius:8px;padding:10px 14px;margin-top:12px;font-size:13px;color:#085041;">
      ✓ Completed by <strong>${esc(userMap[task.completedBy ?? ''] ?? task.completedBy ?? '')}</strong> on ${fmtDateTime(task.completedAt)}
    </div>` : ''

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
        <div class="prop"><div class="prop-label">Client</div><div class="prop-value">${esc(client?.name ?? '—')}</div></div>
        <div class="prop"><div class="prop-label">Bucket</div><div class="prop-value">${esc(task.bucket ?? '—')}</div></div>
        <div class="prop"><div class="prop-label">Assignees</div><div class="prop-value">${esc(assigneeNames)}</div></div>
        <div class="prop"><div class="prop-label">Date Range</div><div class="prop-value">${fmtDate(task.dateStart)} → ${fmtDate(task.dateEnd)}</div></div>
        <div class="prop"><div class="prop-label">PO Numbers</div><div class="prop-value">${esc(poList)}</div></div>
        <div class="prop"><div class="prop-label">Created</div><div class="prop-value">${fmtDateTime(task.createdAt)}</div></div>
      </div>
      ${labelPills ? `<div style="margin-top:10px;">${labelPills}</div>` : ''}
    </div>

    ${task.notes ? `
    <div class="section">
      <div class="section-title">Notes</div>
      <p style="font-size:13px;color:#444;line-height:1.6;white-space:pre-wrap;">${esc(task.notes)}</p>
    </div>` : ''}

    ${(task.awbs ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">AWB Shipments</div>
      <table>
        <thead><tr><th>AWB</th><th>Carrier</th><th>Boxes</th><th>Ship Date</th><th>ETA</th><th>ATA</th></tr></thead>
        <tbody>${awbRows}</tbody>
      </table>
    </div>` : ''}

    ${(task.subtasks ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">Subtasks (${(task.subtasks ?? []).filter(s => s.completed).length}/${(task.subtasks ?? []).length} done)</div>
      <table><tbody>${subtaskRows}</tbody></table>
    </div>` : ''}

    ${(task.attachments ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">Attachments</div>
      <ul style="margin:0;padding-left:18px;">${attachmentList}</ul>
    </div>` : ''}

    ${comments.length > 0 ? `
    <div class="section">
      <div class="section-title">Comments (${comments.length})</div>
      ${commentList}
    </div>` : ''}

    ${history.length > 0 ? `
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
