// src/lib/plannerImporter.ts
// Microsoft Planner Excel/CSV import logic
// Parses Planner exports and matches clients to tasks

import type { RawPlannerTask, MatchResult, Client } from '../types'
import * as XLSX from 'xlsx'

// ─────────────────────────────────────────
// CLIENT ALIAS DICTIONARY
// Maps specific keywords to client names for direct matching
// ─────────────────────────────────────────

const CLIENT_ALIASES: Record<string, string> = {
  // Carolina variants -> Hannaford
  'CAROLINA': 'Hannaford',
  "CAROLINA'S": 'Hannaford',
  'CAROLINAS': 'Hannaford',
  
  // Add more aliases here as needed
  // 'KEYWORD': 'Client Name',
}

/**
 * Check if any alias in the dictionary matches the title
 * Returns the matched client name or null
 */
function findClientByAlias(title: string, clients: Client[]): Client | null {
  const normTitle = title.toUpperCase().replace(/\s+/g, ' ').trim()
  
  for (const [alias, clientName] of Object.entries(CLIENT_ALIASES)) {
    // Check for exact word match or substring match
    const aliasWords = alias.split(' ')
    const titleWords = normTitle.split(' ')
    
    // Check if all alias words appear in title (in order)
    let aliasIndex = 0
    for (const word of titleWords) {
      if (word === aliasWords[aliasIndex]) {
        aliasIndex++
        if (aliasIndex === aliasWords.length) {
          // Found all alias words, find matching client
          const matchedClient = clients.find(c => 
            c.name.toUpperCase() === clientName.toUpperCase()
          )
          if (matchedClient) return matchedClient
          break
        }
      }
    }
    
    // Also check for simple substring match
    if (normTitle.includes(alias)) {
      const matchedClient = clients.find(c => 
        c.name.toUpperCase() === clientName.toUpperCase()
      )
      if (matchedClient) return matchedClient
    }
  }
  
  return null
}

/**
 * Parse a Microsoft Planner export file (.xlsx or .csv)
 * Returns array of raw tasks from the file
 */
export async function parsePlannerExport(file: File): Promise<RawPlannerTask[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          reject(new Error('Failed to read file'))
          return
        }
        
        const workbook = XLSX.read(data, { type: 'binary' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1 })
        
        if (jsonData.length < 2) {
          reject(new Error('File appears to be empty'))
          return
        }
        
        // Find header row and map column indices
        const firstRow = jsonData[0]
        const headers = Array.isArray(firstRow) 
          ? firstRow.map(h => String(h).toLowerCase().trim())
          : []
        
        const colMap: Record<string, number> = {
          taskName: findColumnIndex(headers, ['task name', 'title', 'name']),
          bucketName: findColumnIndex(headers, ['bucket name', 'bucket', 'column']),
          assignedTo: findColumnIndex(headers, ['assigned to', 'assignees', 'assigned']),
          createdDate: findColumnIndex(headers, ['created date', 'created', 'date created']),
          startDate: findColumnIndex(headers, ['start date', 'startdate', 'start']),
          dueDate: findColumnIndex(headers, ['due date', 'duedate', 'end date', 'deadline']),
          description: findColumnIndex(headers, ['description', 'notes', 'details']),
        }
        
        // Validate required columns
        if (colMap.taskName === -1 || colMap.bucketName === -1) {
          reject(new Error('File format not recognized. Please export from Microsoft Planner.'))
          return
        }
        
        const tasks: RawPlannerTask[] = []
        
        // Parse data rows (skip header)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i]
          if (!Array.isArray(row) || row.length === 0) continue
          
          const taskName = getCellValue(row, colMap.taskName)
          if (!taskName) continue // Skip empty rows
          
          tasks.push({
            title: taskName,
            bucket: getCellValue(row, colMap.bucketName) || 'No Bucket',
            assigneeNames: parseAssignees(getCellValue(row, colMap.assignedTo)),
            createdAt: parseDate(getCellValue(row, colMap.createdDate)) || new Date(),
            dateStart: parseDate(getCellValue(row, colMap.startDate)),
            dateEnd: parseDate(getCellValue(row, colMap.dueDate)),
            notes: getCellValue(row, colMap.description) || '',
          })
        }
        
        resolve(tasks)
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err}`))
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsBinaryString(file)
  })
}

/**
 * Normalize a string for matching: uppercase, remove extra spaces, trim
 */
function normalizeForMatch(str: string): string {
  return str.toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * Check if title contains client name with optional trailing "S" tolerance
 * Examples: "Albertson" matches "ALBERTSONS", "hannaford" matches "HANNAFORDS"
 */
function titleContainsClient(title: string, clientName: string): boolean {
  const normTitle = normalizeForMatch(title)
  const normClient = normalizeForMatch(clientName)
  
  // Direct match
  if (normTitle.includes(normClient)) return true
  
  // Try with trailing S removed from client name (e.g., "ALBERTSONS" -> "ALBERTSON")
  if (normClient.endsWith('S') && normClient.length > 1) {
    const clientWithoutS = normClient.slice(0, -1)
    if (normTitle.includes(clientWithoutS)) return true
  }
  
  // Try with trailing S added to client name (e.g., "ALBERTSON" -> "ALBERTSONS")
  if (!normClient.endsWith('S')) {
    const clientWithS = normClient + 'S'
    if (normTitle.includes(clientWithS)) return true
  }
  
  return false
}

/**
 * Extract priority keywords from title for better matching
 * Example: "floriexpo adam bqts" -> priority on "adam"
 */
function extractPriorityKeywords(title: string): string[] {
  const words = normalizeForMatch(title).split(' ').filter(w => w.length >= 3)
  // Return words that are likely client names (not common words like "THE", "FOR", etc.)
  const commonWords = new Set(['THE', 'AND', 'FOR', 'WITH', 'FROM', 'NEW', 'BQTS', 'ROSES', 'WEEKLY'])
  return words.filter(w => !commonWords.has(w))
}

/**
 * Check if task title contains any client name from the dropdown list
 * This ALWAYS searches for the client name inside the task title
 * Examples:
 *   - "publix roses" contains "PUBLIX" -> match
 *   - "mama mia publix bqt" contains "PUBLIX" -> match
 *   - "crolina's house event" -> alias match (handled separately)
 */
function findClientInTaskTitle(taskTitle: string, clients: Client[]): Client | null {
  const normTitle = normalizeForMatch(taskTitle)
  
  // Sort by longest client name first to avoid partial matches
  const sortedClients = [...clients].sort((a, b) => b.name.length - a.name.length)
  
  for (const client of sortedClients) {
    const normClient = normalizeForMatch(client.name)
    
    // PRIMARY: Check if client name is contained in title
    // Example: "PUBLIX" is in "MAMA MIA PUBLIX BQT"
    if (normTitle.includes(normClient)) return client
    
    // SECONDARY: Check with trailing S tolerance
    // Example: "ALBERTSON" is in "ALBERTSONS IRVINE" (from dropdown)
    if (normClient.endsWith('S') && normClient.length > 1) {
      const clientWithoutS = normClient.slice(0, -1)
      if (normTitle.includes(clientWithoutS)) return client
    }
    // Example: "ALBERTSONS" is in "ALBERTSON MAMA MIA"
    if (!normClient.endsWith('S')) {
      const clientWithS = normClient + 'S'
      if (normTitle.includes(clientWithS)) return client
    }
    
    // TERTIARY: Check word-by-word for partial matches
    // Example: "HANNAFORD" matches "HANNAFORDS" or vice versa
    const titleWords = normTitle.split(/\s+/)
    const clientWords = normClient.split(/\s+/)
    
    for (const cw of clientWords) {
      if (cw.length < 3) continue // Skip short words
      
      for (const tw of titleWords) {
        if (tw.length < 3) continue
        
        // Check if word from client matches word from title (with S tolerance)
        if (tw === cw || 
            (cw.endsWith('S') && tw === cw.slice(0, -1)) ||
            (!cw.endsWith('S') && tw === cw + 'S') ||
            tw.includes(cw) || cw.includes(tw)) {
          return client
        }
      }
    }
  }
  
  return null
}

/**
 * Auto-match clients to tasks based on client name appearing in task title
 * - Case-insensitive matching
 * - Trailing "S" tolerance (Albertson matches ALBERTSONS)
 * - Priority matching for keywords in multi-word titles
 * - Longest match first to avoid partial matches
 */
export function autoMatchClients(tasks: RawPlannerTask[], clients: Client[]): MatchResult[] {
  return tasks.map(task => {
    // Priority 0: Check alias dictionary first (highest priority)
    const aliasMatch = findClientByAlias(task.title, clients)
    if (aliasMatch) {
      return {
        task,
        clientId: aliasMatch.id,
        clientName: aliasMatch.name,
        confidence: 'auto' as const,
      }
    }
    
    // Priority 1: Check if any client from dropdown matches the task title
    const directMatch = findClientInTaskTitle(task.title, clients)
    if (directMatch) {
      return {
        task,
        clientId: directMatch.id,
        clientName: directMatch.name,
        confidence: 'auto' as const,
      }
    }
    
    const priorityKeywords = extractPriorityKeywords(task.title)
    
    // Priority 2: try to match priority keywords (exact word matches)
    for (const keyword of priorityKeywords) {
      for (const client of clients) {
        const clientNorm = normalizeForMatch(client.name)
        // Check if keyword matches client name (with S tolerance)
        if (keyword === clientNorm || 
            (clientNorm.endsWith('S') && keyword === clientNorm.slice(0, -1)) ||
            (!clientNorm.endsWith('S') && keyword === clientNorm + 'S')) {
          return {
            task,
            clientId: client.id,
            clientName: client.name,
            confidence: 'auto' as const,
          }
        }
      }
    }
    
    // Priority 3: sort clients by length (longest first) and check substring match
    const sortedClients = [...clients].sort((a, b) => b.name.length - a.name.length)
    
    for (const client of sortedClients) {
      if (titleContainsClient(task.title, client.name)) {
        return {
          task,
          clientId: client.id,
          clientName: client.name,
          confidence: 'auto' as const,
        }
      }
    }
    
    return {
      task,
      clientId: null,
      clientName: null,
      confidence: 'none' as const,
    }
  })
}

/**
 * Check for duplicate tasks within existing historical tasks
 * Returns array of duplicate task titles
 */
export async function findDuplicateTasks(
  tasks: RawPlannerTask[],
  existingHistoricalTasks: { title: string; dateEnd: Date | null }[]
): Promise<string[]> {
  const duplicates: string[] = []
  
  for (const task of tasks) {
    const isDuplicate = existingHistoricalTasks.some(existing => {
      const titleMatch = existing.title.toUpperCase() === task.title.toUpperCase()
      const dateMatch = existing.dateEnd && task.dateEnd
        ? existing.dateEnd.getTime() === task.dateEnd.getTime()
        : true // If either has no date, consider it a potential match
      return titleMatch && dateMatch
    })
    
    if (isDuplicate) {
      duplicates.push(task.title)
    }
  }
  
  return duplicates
}

// ─────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────

function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (const name of possibleNames) {
    const index = headers.findIndex(h => h.includes(name.toLowerCase()))
    if (index !== -1) return index
  }
  return -1
}

function getCellValue(row: unknown[], index: number): string {
  if (index === -1 || index >= row.length) return ''
  const value = row[index]
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function parseAssignees(assigneeString: string): string[] {
  if (!assigneeString) return []
  
  // Microsoft Planner exports assignees as semicolon-separated
  return assigneeString
    .split(';')
    .map(name => name.trim())
    .filter(name => name.length > 0)
}

function parseDate(dateValue: string): Date | null {
  if (!dateValue) return null
  
  // Try parsing as MM/DD/YYYY (Planner format)
  const parts = dateValue.split('/')
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10) - 1
    const day = parseInt(parts[1], 10)
    const year = parseInt(parts[2], 10)
    const date = new Date(year, month, day)
    if (!isNaN(date.getTime())) return date
  }
  
  // Try standard date parsing
  const parsed = new Date(dateValue)
  if (!isNaN(parsed.getTime())) return parsed
  
  return null
}

/**
 * Get preview statistics from parsed tasks
 */
export function getImportPreview(tasks: RawPlannerTask[]): {
  taskCount: number
  bucketCount: number
  dateRange: { earliest: Date | null; latest: Date | null }
  uniqueBuckets: string[]
  assigneeCount: number
} {
  const buckets = new Set(tasks.map(t => t.bucket))
  const assignees = new Set(tasks.flatMap(t => t.assigneeNames))
  
  const dates = tasks
    .flatMap(t => [t.dateEnd, t.createdAt])
    .filter((d): d is Date => d !== null)
  
  const earliest = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
  const latest = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
  
  return {
    taskCount: tasks.length,
    bucketCount: buckets.size,
    dateRange: { earliest, latest },
    uniqueBuckets: Array.from(buckets),
    assigneeCount: assignees.size,
  }
}
