// src/renderer/src/utils/taskReportSaver.ts
// Saves a task report HTML to the SharePoint folder

import type { Task } from '../types'
import type { ReportData } from './taskReportGenerator'
import { generateTaskReportHTML } from './taskReportGenerator'
import { getComments, getTaskHistory } from '../lib/firestore'

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80)
}

export async function saveTaskReport(
  task: Task,
  reportHTML: string,
  sharePointPath: string,
  clientName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const year = (task.createdAt?.toDate?.()?.getFullYear?.() ?? new Date().getFullYear()).toString()
    const safeClient = sanitize(clientName || 'Unknown')
    const safeTitle  = sanitize(task.title)
    const fileName   = `REPORT_${safeTitle}.html`
    const destPath   = `${sharePointPath}/REPORTS (NPD-SECURE)/${year}/${safeClient}/${safeTitle}/${fileName}`

    const result = await window.electronAPI.invoke('file:save-text', destPath, reportHTML) as { success: boolean; error?: string }
    return result
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function generateAndSaveTaskReport(
  task: Task,
  sharePointPath: string,
  clientName: string,
  partialData: Omit<ReportData, 'task' | 'comments' | 'history'>
): Promise<{ success: boolean; error?: string }> {
  try {
    const [comments, history] = await Promise.all([
      getComments(task.id),
      getTaskHistory(task.id),
    ])
    const html = generateTaskReportHTML({ ...partialData, task, comments, history })
    return saveTaskReport(task, html, sharePointPath, clientName)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
