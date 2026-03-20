// src/renderer/src/lib/sharepointTemplates.ts
// Save Trip and Vacation HTML files to SharePoint

import type { Task, BoardType } from '../types'
import { generateTripHTML, generateVacationHTML, taskToTripData, taskToVacationData } from '../utils/sharepointTemplates'

const LS_KEY = 'npd_sharepoint_path'

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80)
}

function getSharePointPath(): string | null {
  return localStorage.getItem(LS_KEY)
}

interface SaveResult {
  success: boolean
  relativePath?: string
  error?: string
}

/**
 * Saves a Trip as HTML file to SharePoint
 * Structure: NPD-PLANNER/{year}/trips/{person}/{trip-name}.html
 */
export async function saveTripHTML(
  task: Task,
  personName: string
): Promise<SaveResult> {
  const sharePointPath = getSharePointPath()
  if (!sharePointPath) {
    return { success: false, error: 'SharePoint path not configured' }
  }

  try {
    // Get year from task start date
    const year = task.dateStart 
      ? new Date(task.dateStart.toDate()).getFullYear()
      : new Date().getFullYear()

    const safePerson = sanitizeName(personName || 'Unknown')
    const safeTripName = sanitizeName(task.title || 'trip')
    const fileName = `${safeTripName}.html`

    // Build paths
    const destPath = [sharePointPath, String(year), 'trips', safePerson, fileName].join('|||')
    const relativePath = [String(year), 'trips', safePerson, fileName].join('/')

    // Generate HTML content
    const tripData = taskToTripData(task, personName)
    const htmlContent = generateTripHTML(tripData)

    // Save via IPC using generic invoke
    const result = await window.electronAPI.invoke('file:save-text', destPath, htmlContent) as { success: boolean; error?: string }

    if (result.success) {
      return { success: true, relativePath }
    } else {
      return { success: false, error: result.error || 'Failed to save file' }
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Saves a Vacation as HTML file to SharePoint
 * Structure: NPD-PLANNER/{year}/vacations/{person}/VAC-{year}-{id}.html
 */
export async function saveVacationHTML(
  task: Task,
  personName: string,
  vacationType: string
): Promise<SaveResult> {
  const sharePointPath = getSharePointPath()
  if (!sharePointPath) {
    return { success: false, error: 'SharePoint path not configured' }
  }

  try {
    // Get year from task start date
    const year = task.dateStart 
      ? new Date(task.dateStart.toDate()).getFullYear()
      : new Date().getFullYear()

    const safePerson = sanitizeName(personName || 'Unknown')
    const fileName = `VAC-${year}-${task.id.slice(-6)}.html`

    // Build paths
    const destPath = [sharePointPath, String(year), 'vacations', safePerson, fileName].join('|||')
    const relativePath = [String(year), 'vacations', safePerson, fileName].join('/')

    // Generate HTML content
    const vacationData = taskToVacationData(task, personName, vacationType)
    const htmlContent = generateVacationHTML(vacationData)

    // Save via IPC using generic invoke
    const result = await window.electronAPI.invoke('file:save-text', destPath, htmlContent) as { success: boolean; error?: string }

    if (result.success) {
      return { success: true, relativePath }
    } else {
      return { success: false, error: result.error || 'Failed to save file' }
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Determines if a task should generate a SharePoint HTML file
 * and triggers the appropriate save function.
 * Should be called when a task is created or updated.
 */
export async function syncTaskToSharePoint(
  task: Task,
  boardType: BoardType,
  personName: string,
  vacationType?: string
): Promise<SaveResult> {
  switch (boardType) {
    case 'trips':
      return saveTripHTML(task, personName)
    
    case 'vacations':
      if (!vacationType) {
        return { success: false, error: 'Vacation type is required' }
      }
      return saveVacationHTML(task, personName, vacationType)
    
    case 'planner':
    case 'custom':
    default:
      // Planner uses attachments, not HTML files
      return { success: true }
  }
}
