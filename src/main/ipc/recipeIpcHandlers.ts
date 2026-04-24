// src/main/ipc/recipeIpcHandlers.ts
// IPC handlers for Recipe Manager — runs in Electron main process (Node.js)
// Uses exceljs for Excel read/write operations

import { ipcMain, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import ExcelJS from 'exceljs'

const execAsync = promisify(exec)

/** Normalize a path so mixed / and \ separators always resolve correctly on any platform. */
function np(p: string): string {
  // On Mac/Linux, backslashes are not path separators — convert them to forward slashes first
  const normalized = process.platform === 'win32' ? p : p.replace(/\\/g, '/')
  return path.normalize(normalized)
}

// ─────────────────────────────────────────
// TYPES (mirrored for main process use)
// ─────────────────────────────────────────

interface RecipeCellChange {
  cell: string
  value: string | number | boolean | null
}

interface RecipeScannedFile {
  relativePath: string
  displayName: string
  price: string
  option: string
  name: string
  recipeUid: string   // contents of Z52; empty string if blank or unreadable
}

// Plain-object version of CapturedPhoto for IPC transport (no Firestore Timestamp class)
interface CapturedPhotoPOJO {
  sequence: number
  filename: string
  subfolderName: string
  picturePath: string
  cameraPath: string
  ssdPath: string | null
  capturedAt: { seconds: number; nanoseconds: number }
  capturedBy: string
  isSelected: boolean
  selectedAt?: { seconds: number; nanoseconds: number }
  selectedBy?: string
}

interface RenameWithPhotosInput {
  excelPath: string
  newBaseName: string
  newDisplayName: string
  capturedPhotos: CapturedPhotoPOJO[]
  readyPngPath: string | null
  readyJpgPath: string | null
  projectRoot: string
  ssdBase: string | null
  projectName: string
}

interface RenameWithPhotosResult {
  success: boolean
  newExcelPath: string
  updatedPhotos: CapturedPhotoPOJO[]
  newReadyPngPath: string | null
  newReadyJpgPath: string | null
  errors: string[]
}

interface RecipeSpec {
  recipeId: string
  relativePath: string
  displayName: string
  price: string
  option: string
  name: string
  projectName: string
  holidayOverride: string
  customerOverride: string
  wetPackOverride: string
  boxTypeOverride: string
  pickNeededOverride: string
  requiresManualUpdate: boolean
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

/** Get the cell value from a worksheet as a string */
function getCellStringValue(ws: ExcelJS.Worksheet, cellAddr: string): string {
  const cell = ws.getCell(cellAddr)
  if (cell.value === null || cell.value === undefined) return ''
  if (typeof cell.value === 'object' && 'result' in (cell.value as ExcelJS.CellFormulaValue)) {
    const formula = cell.value as ExcelJS.CellFormulaValue
    const result = formula.result
    if (result === null || result === undefined) return ''
    return String(result)
  }
  return String(cell.value)
}


/**
 * Detect if a file is open in Excel on Windows by checking for the lock file
 * Excel creates a hidden file "~$filename.ext" when the file is open.
 */
function isFileLockedByExcel(filePath: string): boolean {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const lockFile = path.join(dir, `~$${base}`)
  return fs.existsSync(lockFile)
}

/** Walk a directory recursively and collect all .xlsx files, reading Z52 for stable recipeUid */
async function walkXlsx(
  rootPath: string,
  currentPath: string,
  results: RecipeScannedFile[]
): Promise<void> {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      // Skip the _project metadata folder and PICTURES folder
      if (entry.name === '_project' || entry.name === 'PICTURES') continue
      await walkXlsx(rootPath, fullPath, results)
    } else if (entry.isFile() && entry.name.endsWith('.xlsx') && !entry.name.startsWith('~$')) {
      const relativePath = path.relative(rootPath, fullPath)
      const parsed = parseRecipeFilename(entry.name)
      let recipeUid = ''
      try {
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.readFile(fullPath)
        const ws = wb.getWorksheet('Quote') ?? wb.worksheets[0]
        if (ws) recipeUid = getCellStringValue(ws, 'Z52').trim()
      } catch {
        // File locked or corrupt — recipeUid stays '' (legacy fallback kicks in)
      }
      results.push({
        relativePath,
        displayName: parsed.displayName,
        price: parsed.price,
        option: parsed.option,
        name: parsed.name,
        recipeUid,
      })
    }
  }
}

/**
 * Parse a recipe filename like "$12.99 A VALENTINE.xlsx"
 * into { price, option, name, displayName }
 */
function parseRecipeFilename(filename: string): {
  price: string
  option: string
  name: string
  displayName: string
} {
  // Remove extension
  const base = filename.replace(/\.xlsx$/i, '').trim()
  const displayName = base

  // Tokenize
  const tokens = base.split(/\s+/)
  let price = ''
  let option = ''
  let nameTokens: string[] = []

  const priceRegex = /^\$?\d+(?:\.\d{1,2})?$/
  const optionRegex = /^[A-C]$/

  let i = 0
  // Find price token
  if (i < tokens.length && priceRegex.test(tokens[i])) {
    price = tokens[i].startsWith('$') ? tokens[i] : `$${tokens[i]}`
    i++
    // Find option token immediately after price
    if (i < tokens.length && optionRegex.test(tokens[i])) {
      option = tokens[i]
      i++
    }
  }
  nameTokens = tokens.slice(i)

  return {
    price,
    option,
    name: nameTokens.join(' '),
    displayName,
  }
}

// ─────────────────────────────────────────
// IPC HANDLER REGISTRATION
// ─────────────────────────────────────────

/**
 * Write cells to an Excel file using PowerShell + Excel COM automation.
 * This preserves ALL workbook features (conditional formatting, data validation, etc.)
 * because Excel itself handles the save — same approach as EliteQuote's HybridExcelBackend.
 * Falls back silently if Excel/PowerShell is unavailable (file was already copied).
 */
interface ExcelFileWrite {
  filePath: string
  updates: Array<{ sheet: string; cell: string; value: string }>
}

/**
 * Some Excel dropdown cells store values with leading/trailing spaces that must match exactly.
 * Maps our clean UI values to their exact Excel dropdown equivalents.
 * - Z6 (Box Type): "QUARTER" → "QUARTER " (trailing space in LIST!A151)
 * - D7 (Customer): "OPEN DESIGN" → " OPEN DESIGN", "NEW CUSTOMER" → " NEW CUSTOMER" (leading space in CUST LIST)
 */
function normalizeExcelValue(cell: string, value: string): string {
  const c = cell.toUpperCase()
  if (c === 'Z6' && value === 'QUARTER') return 'QUARTER '
  if (c === 'D7') {
    if (value === 'OPEN DESIGN') return ' OPEN DESIGN'
    if (value === 'NEW CUSTOMER') return ' NEW CUSTOMER'
  }
  return value
}

/**
 * Write cells to one or more Excel files using AppleScript + Excel for Mac.
 * Mac equivalent of the Windows COM approach — Excel itself handles the save,
 * so conditional formatting, data validation, and macros are fully preserved.
 */
async function writeExcelViaAppleScript(files: ExcelFileWrite[]): Promise<void> {
  const filesToProcess = files
    .map((f) => ({
      ...f,
      updates: f.updates
        .filter((u) => u.value !== '' && u.value !== undefined)
        .map((u) => ({ ...u, value: normalizeExcelValue(u.cell, u.value) })),
    }))
    .filter((f) => f.updates.length > 0)

  if (filesToProcess.length === 0) return

  // Group updates by sheet so we can use tell-worksheet blocks (avoids -50 Parameter error)
  const blocks: string[] = []
  for (const { filePath, updates } of filesToProcess) {
    const absPath = path.resolve(filePath)
    const safePath = absPath.replace(/\\/g, '/').replace(/"/g, '\\"')

    // Group by sheet name
    const bySheet = new Map<string, Array<{ cell: string; value: string }>>()
    for (const u of updates) {
      const list = bySheet.get(u.sheet) ?? []
      list.push({ cell: u.cell, value: u.value })
      bySheet.set(u.sheet, list)
    }

    const sheetBlocks: string[] = []
    for (const [sheet, cells] of bySheet) {
      const safeSheet = sheet.replace(/"/g, '\\"')
      const cellLines = cells
        .map(({ cell, value }) => {
          // Escape backslashes then double quotes for AppleScript string literals
          const safeValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          return `      set value of cell "${cell}" to "${safeValue}"`
        })
        .join('\n')
      sheetBlocks.push(`    tell worksheet "${safeSheet}" of wb\n${cellLines}\n    end tell`)
    }

    blocks.push(
      `  set wb to open workbook workbook file name (POSIX file "${safePath}" as text)\n` +
      sheetBlocks.join('\n') + '\n' +
      `  close wb saving yes`
    )
  }

  const script = [
    'tell application "Microsoft Excel"',
    '  set display alerts to false',
    ...blocks,
    '  set display alerts to true',
    'end tell',
  ].join('\n')

  const tmpFile = path.join(os.tmpdir(), `recipe_write_${Date.now()}.applescript`)
  fs.writeFileSync(tmpFile, script, 'utf8')

  try {
    const { stderr } = await execAsync(`osascript "${tmpFile}"`, { timeout: 300000 })
    if (stderr?.trim()) console.warn('AppleScript stderr:', stderr.trim())
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const detail = [e.stderr, e.stdout].filter(Boolean).join('\n').trim() || e.message || String(err)
    console.error('Failed AppleScript:', tmpFile)
    throw new Error(`AppleScript Excel error: ${detail}`)
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

/**
 * Write cells to one or more Excel files in a SINGLE Excel COM session (Windows only).
 * Opening Excel once for all files avoids RPC_E_CALL_REJECTED when processing batches.
 */
async function writeExcelViaCOMWindows(files: ExcelFileWrite[]): Promise<void> {
  const filesToProcess = files
    .map((f) => ({
      ...f,
      updates: f.updates
        .filter((u) => u.value !== '' && u.value !== undefined)
        .map((u) => ({ ...u, value: normalizeExcelValue(u.cell, u.value) })),
    }))
    .filter((f) => f.updates.length > 0)

  if (filesToProcess.length === 0) return

  const inner: string[] = []
  for (const { filePath, updates } of filesToProcess) {
    const absPath = path.resolve(filePath).replace(/'/g, "''")
    inner.push(`  $wb = $excel.Workbooks.Open('${absPath}', 0, $false)`)
    for (const { sheet, cell, value } of updates) {
      const safeSheet = sheet.replace(/'/g, "''")
      const safeValue = value.replace(/'/g, "''")
      inner.push(`  $wb.Worksheets('${safeSheet}').Range('${cell}').Value = '${safeValue}'`)
    }
    inner.push('  try { $excel.CalculateFull() } catch { }')
    inner.push('  $wb.Save()')
    inner.push('  $wb.Close($false)')
  }

  const script = [
    '$ErrorActionPreference = "Stop"',
    '$excel = New-Object -ComObject Excel.Application',
    '$excel.Visible = $false',
    '$excel.DisplayAlerts = $false',
    'try {',
    ...inner,
    '} finally {',
    '  try { $excel.Quit() } catch { }',
    '  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null',
    '}',
  ].join('\r\n')

  const tmpFile = path.join(os.tmpdir(), `recipe_write_${Date.now()}.ps1`)
  fs.writeFileSync(tmpFile, script, 'utf8')

  try {
    const { stdout, stderr } = await execAsync(
      `powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { timeout: 300000 }
    )
    if (stderr?.trim()) console.warn('PS stderr:', stderr.trim())
    if (stdout?.trim()) console.log('PS stdout:', stdout.trim())
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const detail = [e.stderr, e.stdout].filter(Boolean).join('\n').trim() || e.message || String(err)
    // Keep the script on failure so it can be inspected
    console.error('Failed PS script:', tmpFile)
    console.error('Script contents:\n', script)
    throw new Error(`PowerShell COM error: ${detail}`)
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

/**
 * Cross-platform dispatcher: uses AppleScript on Mac, PowerShell COM on Windows.
 */
async function writeExcelViaCOM(files: ExcelFileWrite[]): Promise<void> {
  if (process.platform === 'darwin') {
    return writeExcelViaAppleScript(files)
  }
  return writeExcelViaCOMWindows(files)
}

export function registerRecipeHandlers(): void {

  // ── Read multiple cells from an Excel file ────────────────────────────────
  ipcMain.handle(
    'recipe:readCells',
    async (_event, filePath: string, cells: string[]): Promise<Record<string, string>> => {
      try {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(np(filePath))
        const ws = workbook.getWorksheet('Quote') ?? workbook.getWorksheet(1)
        if (!ws) throw new Error('No worksheet found in file')

        const result: Record<string, string> = {}
        for (const cellAddr of cells) {
          result[cellAddr] = getCellStringValue(ws, cellAddr)
        }
        return result
      } catch (err) {
        console.error('recipe:readCells error:', err)
        throw err
      }
    }
  )

  // ── Write multiple cells to an Excel file ─────────────────────────────────
  ipcMain.handle(
    'recipe:writeCells',
    async (_event, filePath: string, changes: RecipeCellChange[]): Promise<{ success: boolean }> => {
      try {
        await writeExcelViaCOM([{
          filePath: np(filePath),
          updates: changes.map((c) => ({ sheet: 'Quote', cell: c.cell, value: String(c.value ?? '') }))
        }])
        return { success: true }
      } catch (err) {
        console.error('recipe:writeCells error:', err)
        throw err
      }
    }
  )

  // ── Generate a new Excel file from a template (copy only — use batchGenerate for cell writes) ──
  ipcMain.handle(
    'recipe:generateFromTemplate',
    async (
      _event,
      templatePath: string,
      outputPath: string,
      _recipeData: RecipeSpec
    ): Promise<{ success: boolean }> => {
      try {
        const safeSrc = np(templatePath)
        const safeOut = np(outputPath)
        fs.mkdirSync(path.dirname(safeOut), { recursive: true })

        // Retry up to 5 times — EBUSY happens when the template is open in Excel
        // or OneDrive is syncing it. Short delays are usually enough to clear it.
        const MAX_RETRIES = 5
        const RETRY_DELAY_MS = 800
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            fs.copyFileSync(safeSrc, safeOut)
            return { success: true }
          } catch (copyErr: unknown) {
            const nodeErr = copyErr as NodeJS.ErrnoException
            if (nodeErr.code === 'EBUSY' || nodeErr.code === 'EPERM') {
              await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
            } else {
              throw copyErr
            }
          }
        }

        // All retries exhausted — surface a friendly message
        const friendly = new Error(
          `The template file is locked by another program (e.g. Excel or OneDrive). ` +
          `Please close it and try again.\n\nFile: ${path.basename(safeSrc)}`
        )
        ;(friendly as NodeJS.ErrnoException).code = 'EBUSY'
        throw friendly
      } catch (err) {
        console.error('recipe:generateFromTemplate error:', err)
        throw err
      }
    }
  )

  // ── Batch generate: copy all files then write all cells in ONE Excel session ──
  ipcMain.handle(
    'recipe:batchWriteCells',
    async (
      _event,
      batch: Array<{ filePath: string; updates: Array<{ sheet: string; cell: string; value: string }> }>
    ): Promise<{ success: boolean }> => {
      try {
        await writeExcelViaCOM(batch.map((b) => ({ ...b, filePath: np(b.filePath) })))
        return { success: true }
      } catch (err) {
        console.error('recipe:batchWriteCells error:', err)
        throw err
      }
    }
  )

  // ── Rename an Excel file ──────────────────────────────────────────────────
  ipcMain.handle(
    'recipe:renameFile',
    async (_event, oldPath: string, newPath: string): Promise<{ success: boolean }> => {
      try {
        if (isFileLockedByExcel(np(oldPath))) {
          throw new Error('File is currently open in Excel. Close it before renaming.')
        }
        fs.renameSync(np(oldPath), np(newPath))
        return { success: true }
      } catch (err) {
        console.error('recipe:renameFile error:', err)
        throw err
      }
    }
  )

  // ── Check if a file is currently open in Excel ────────────────────────────
  ipcMain.handle(
    'recipe:isFileOpen',
    async (_event, filePath: string): Promise<boolean> => {
      try {
        return isFileLockedByExcel(np(filePath))
      } catch (err) {
        console.error('recipe:isFileOpen error:', err)
        return false
      }
    }
  )

  // ── Create a folder (recursive) ───────────────────────────────────────────
  ipcMain.handle(
    'recipe:createFolder',
    async (_event, folderPath: string): Promise<{ success: boolean }> => {
      try {
        fs.mkdirSync(np(folderPath), { recursive: true })
        return { success: true }
      } catch (err) {
        console.error('recipe:createFolder error:', err)
        throw err
      }
    }
  )

  // ── Scan a project root for all .xlsx files ───────────────────────────────
  ipcMain.handle(
    'recipe:scanProject',
    async (_event, rootPath: string): Promise<RecipeScannedFile[]> => {
      try {
        if (!fs.existsSync(np(rootPath))) {
          return []
        }
        const results: RecipeScannedFile[] = []
        await walkXlsx(np(rootPath), np(rootPath), results)
        return results
      } catch (err) {
        console.error('recipe:scanProject error:', err)
        throw err
      }
    }
  )

  // ── List one level of a folder (non-recursive) ───────────────────────────
  ipcMain.handle(
    'recipe:listFolder',
    async (_event, folderPath: string): Promise<Array<{
      name: string
      isDirectory: boolean
      size: number
      modifiedAt: string   // ISO string — Date is not serializable over IPC
      fullPath: string
    }>> => {
      try {
        if (!fs.existsSync(np(folderPath))) return []
        const entries = fs.readdirSync(np(folderPath), { withFileTypes: true })
        const result: Array<{
          name: string; isDirectory: boolean; size: number; modifiedAt: string; fullPath: string
        }> = []
        for (const entry of entries) {
          // Exclude metadata folder and Excel lock files
          if (entry.isDirectory() && entry.name === '_project') continue
          if (entry.isFile() && entry.name.startsWith('~$')) continue
          const fullPath = path.join(folderPath, entry.name)
          const stat = fs.statSync(fullPath)
          result.push({
            name:        entry.name,
            isDirectory: entry.isDirectory(),
            size:        entry.isDirectory() ? 0 : stat.size,
            modifiedAt:  stat.mtime.toISOString(),
            fullPath,
          })
        }
        // Folders first, then files — alphabetical within each group
        result.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        return result
      } catch (err) {
        console.error('recipe:listFolder error:', err)
        return []
      }
    }
  )

  // ── Delete a file or folder ───────────────────────────────────────────────
  ipcMain.handle(
    'recipe:deleteItem',
    async (_event, itemPath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const stat = fs.statSync(np(itemPath))
        if (stat.isDirectory()) {
          fs.rmSync(np(itemPath), { recursive: true, force: true })
        } else {
          fs.unlinkSync(np(itemPath))
        }
        return { success: true }
      } catch (err) {
        console.error('recipe:deleteItem error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ── Rename any file or folder ─────────────────────────────────────────────
  ipcMain.handle(
    'recipe:renameItem',
    async (_event, oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        // Excel lock check for .xlsx files
        if (oldPath.endsWith('.xlsx') && isFileLockedByExcel(np(oldPath))) {
          return { success: false, error: 'Close the file in Excel before renaming' }
        }
        fs.renameSync(np(oldPath), np(newPath))
        return { success: true }
      } catch (err) {
        console.error('recipe:renameItem error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ── Create a new recipe file from template ────────────────────────────────
  ipcMain.handle(
    'recipe:createFileFromTemplate',
    async (
      _event,
      templatePath: string,
      destFolder: string,
      fileName: string
    ): Promise<{ success: boolean; destPath?: string; error?: string }> => {
      try {
        if (!fs.existsSync(np(templatePath))) {
          return { success: false, error: 'Template file not found' }
        }
        // Ensure .xlsx extension
        const safeName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
        const destPath = path.join(np(destFolder), safeName)
        if (fs.existsSync(destPath)) {
          return { success: false, error: 'File already exists' }
        }
        fs.mkdirSync(np(destFolder), { recursive: true })
        fs.copyFileSync(np(templatePath), destPath)
        return { success: true, destPath }
      } catch (err) {
        console.error('recipe:createFileFromTemplate error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ── Open a file with its default application (Excel) ─────────────────────
  ipcMain.handle(
    'recipe:openInExcel',
    async (_event, filePath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await shell.openPath(np(filePath))
        if (result) {
          // shell.openPath returns empty string on success, error string on failure
          return { success: false, error: result }
        }
        return { success: true }
      } catch (err) {
        console.error('recipe:openInExcel error:', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Check if a path exists and is a directory ─────────────────────────────
  ipcMain.handle(
    'recipe:pathExists',
    async (_event, folderPath: string): Promise<boolean> => {
      try {
        return fs.existsSync(np(folderPath)) && fs.statSync(np(folderPath)).isDirectory()
      } catch {
        return false
      }
    }
  )

  // ── Create a blank import template Excel ─────────────────────────────────
  ipcMain.handle(
    'recipe:createImportTemplate',
    async (_event, destPath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        fs.mkdirSync(path.dirname(np(destPath)), { recursive: true })
        const workbook = new ExcelJS.Workbook()
        const ws = workbook.addWorksheet('Import')

        // Headers
        ws.getCell('A1').value = 'Folder'
        ws.getCell('B1').value = 'Name'
        ws.getRow(1).font = { bold: true }

        // Example rows so user understands the format
        ws.getCell('A2').value = 'Valentine'
        ws.getCell('B2').value = '$12.99 A VALENTINE'
        ws.getCell('A3').value = 'Everyday'
        ws.getCell('B3').value = '$9.99 ROSE'
        ws.getCell('A4').value = 'Christmas'
        ws.getCell('B4').value = '$14.99 B XMAS'

        ws.getColumn('A').width = 36
        ws.getColumn('B').width = 22

        await workbook.xlsx.writeFile(destPath)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ── Parse ABS/Book1 format Excel (A=name, B=SRP, C=Box Type, D=Pick Needed, E=holiday) ──
  ipcMain.handle(
    'recipe:parseBook1Excel',
    async (_, filePath: string): Promise<{
      success: boolean
      rows?: Array<{
        name: string; srp: string; boxType: string; pickNeeded: string; holiday: string
      }>
      error?: string
    }> => {
      try {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(np(filePath))
        const sheet = workbook.getWorksheet(1)
        if (!sheet) return { success: false, error: 'No worksheet found' }

        const rows: Array<{ name: string; srp: string; boxType: string; pickNeeded: string; holiday: string }> = []
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return // skip header
          const name      = String(row.getCell(1).value ?? '').trim()
          const srp       = String(row.getCell(2).value ?? '').trim()
          const boxType   = String(row.getCell(3).value ?? '').trim()
          const pickNeeded = String(row.getCell(4).value ?? '').trim()
          const holiday   = String(row.getCell(5).value ?? '').trim()
          if (!name || !srp) return
          rows.push({ name, srp, boxType, pickNeeded, holiday })
        })
        return { success: true, rows }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Parse Excel file for recipe import (A=name/folder, B=SRP, C=BoxType, D=PickNeeded, E=holiday) ──
  ipcMain.handle(
    'recipe:parseImportExcel',
    async (_, filePath: string): Promise<{
      success: boolean
      rows?: Array<{
        name: string
        srp: string
        boxType: string
        pickNeeded: string
        holiday: string
      }>
      error?: string
    }> => {
      try {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(np(filePath))

        const sheet = workbook.getWorksheet(1)
        if (!sheet) return { success: false, error: 'No worksheet found' }

        const rows: Array<{ name: string; srp: string; boxType: string; pickNeeded: string; holiday: string }> = []

        // Auto-detect starting column: find which column has the header "name" in row 1
        let startCol = 1
        const headerRow = sheet.getRow(1)
        for (let c = 1; c <= 10; c++) {
          const v = String(headerRow.getCell(c).value ?? '').trim().toLowerCase()
          if (v === 'name') { startCol = c; break }
        }

        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return // saltar header
          const name = String(row.getCell(startCol).value ?? '').trim()
          if (!name) return
          rows.push({
            name,
            srp:        String(row.getCell(startCol + 1).value ?? '').trim(),
            boxType:    String(row.getCell(startCol + 2).value ?? '').trim(),
            pickNeeded: String(row.getCell(startCol + 3).value ?? '').trim(),
            holiday:    String(row.getCell(startCol + 4).value ?? '').trim(),
          })
        })

        return { success: true, rows }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Validate an existing project folder (for Import Existing) ─────────────
  ipcMain.handle(
    'recipe:validateProjectFolder',
    async (_event, folderPath: string): Promise<{
      valid: boolean
      config?: {
        projectName: string
        createdAt: string
        customerDefault: string
        holidayDefault: string
        wetPackDefault: boolean
        distributionDefault: Record<string, number>
        templatePath: string
        notes: string
      }
      error?: string
    }> => {
      try {
        if (!fs.existsSync(np(folderPath))) {
          return { valid: false, error: 'Folder not found' }
        }
        const projectDir = np(path.join(folderPath, '_project'))
        if (!fs.existsSync(projectDir)) {
          return { valid: false, error: 'No _project/ folder found. This does not appear to be an NPD project.' }
        }
        const configPath = path.join(projectDir, 'project_config.json')
        if (!fs.existsSync(configPath)) {
          return { valid: false, error: '_project/ folder found but missing project_config.json' }
        }
        const raw = fs.readFileSync(configPath, 'utf-8')
        const cfg = JSON.parse(raw)
        return {
          valid: true,
          config: {
            projectName:         cfg.project_name ?? cfg.projectName ?? path.basename(folderPath),
            createdAt:           cfg.created_at   ?? cfg.createdAt   ?? new Date().toISOString(),
            customerDefault:     cfg.customer_default     ?? cfg.customerDefault     ?? 'OPEN DESIGN',
            holidayDefault:      cfg.holiday_default      ?? cfg.holidayDefault      ?? 'EVERYDAY',
            wetPackDefault:      cfg.wet_pack_default     ?? cfg.wetPackDefault      ?? false,
            distributionDefault: cfg.distribution_default ?? cfg.distributionDefault ?? {},
            templatePath:        cfg.template_path        ?? cfg.templatePath        ?? '',
            notes:               cfg.notes ?? '',
          },
        }
      } catch (err) {
        return { valid: false, error: `Failed to read project: ${String(err)}` }
      }
    }
  )

  // ── Rename recipe Excel + all associated photos ───────────────────────────
  ipcMain.handle(
    'recipe:rename-with-photos',
    async (_event, input: RenameWithPhotosInput): Promise<RenameWithPhotosResult> => {
      const errors: string[] = []
      const {
        excelPath, newBaseName, newDisplayName,
        capturedPhotos, readyPngPath, readyJpgPath,
        ssdBase, projectName,
      } = input

      // 1. Guard: file must not be locked by Excel
      if (isFileLockedByExcel(np(excelPath))) {
        return {
          success: false, newExcelPath: excelPath,
          updatedPhotos: capturedPhotos, newReadyPngPath: readyPngPath,
          newReadyJpgPath: readyJpgPath,
          errors: ['The Excel file is open in another program. Please close it and try again.'],
        }
      }

      // 2. Compute new Excel path
      const newExcelPath = path.join(path.dirname(np(excelPath)), `${newBaseName}.xlsx`)
      if (fs.existsSync(newExcelPath)) {
        return {
          success: false, newExcelPath: excelPath,
          updatedPhotos: capturedPhotos, newReadyPngPath: readyPngPath,
          newReadyJpgPath: readyJpgPath,
          errors: [`A file named "${newBaseName}.xlsx" already exists in this folder.`],
        }
      }

      // 3. Rename Excel file (fatal if fails)
      try {
        fs.renameSync(np(excelPath), newExcelPath)
      } catch (err) {
        return {
          success: false, newExcelPath: excelPath,
          updatedPhotos: capturedPhotos, newReadyPngPath: readyPngPath,
          newReadyJpgPath: readyJpgPath,
          errors: [`Failed to rename Excel file: ${String(err)}`],
        }
      }

      // 4. Update D3 (recipe name cell) in the renamed Excel
      try {
        await writeExcelViaCOM([{
          filePath: newExcelPath,
          updates: [{ sheet: 'Quote', cell: 'D3', value: newDisplayName }],
        }])
      } catch (err) {
        errors.push(`Excel cell D3 update failed: ${String(err)}`)
      }

      // 5. Helper: rename/move a single file, returns new path.
      //    Falls back to copy+delete when source and destination are on different drives
      //    (Windows EXDEV error — e.g., project on C: and SSD on D:).
      function safeRenameFile(oldFilePath: string, newFilePath: string): void {
        try {
          fs.renameSync(oldFilePath, newFilePath)
        } catch (err) {
          const e = err as NodeJS.ErrnoException
          if (e.code === 'EXDEV') {
            // Cross-device link — copy then remove original
            fs.copyFileSync(oldFilePath, newFilePath)
            fs.unlinkSync(oldFilePath)
          } else {
            throw err
          }
        }
      }

      function renamePhotoFile(oldFilePath: string, newFilename: string): string {
        const newFilePath = path.join(path.dirname(oldFilePath), newFilename)
        try {
          if (fs.existsSync(oldFilePath)) {
            fs.mkdirSync(path.dirname(newFilePath), { recursive: true })
            safeRenameFile(oldFilePath, newFilePath)
          }
        } catch (err) {
          errors.push(`Could not rename "${path.basename(oldFilePath)}": ${String(err)}`)
        }
        return newFilePath
      }

      // 6. Rename all captured photos (CAMERA + SELECTED on project root)
      const updatedPhotos: CapturedPhotoPOJO[] = capturedPhotos.map(photo => {
        const newFilename = `${newDisplayName} - ${photo.sequence}.jpg`
        const newCameraPath   = renamePhotoFile(photo.cameraPath,   newFilename)
        const newPicturePath  = renamePhotoFile(photo.picturePath,  newFilename)

        // SSD (best-effort — never fatal, handles cross-drive on Windows)
        let newSsdPath = photo.ssdPath
        if (photo.ssdPath) {
          try {
            newSsdPath = path.join(path.dirname(photo.ssdPath), newFilename)
            if (fs.existsSync(photo.ssdPath)) {
              fs.mkdirSync(path.dirname(newSsdPath), { recursive: true })
              safeRenameFile(photo.ssdPath, newSsdPath)
            }
          } catch (err) {
            errors.push(`SSD rename failed for "${photo.filename}": ${String(err)}`)
            newSsdPath = photo.ssdPath  // keep old path if SSD rename failed
          }
        }

        return { ...photo, filename: newFilename, cameraPath: newCameraPath, picturePath: newPicturePath, ssdPath: newSsdPath }
      })

      // 7. Rename READY PNG and JPG files
      let newReadyPngPath = readyPngPath
      let newReadyJpgPath = readyJpgPath

      if (readyPngPath) {
        const ext = path.extname(readyPngPath)
        const newName = `${newDisplayName}${ext}`
        newReadyPngPath = renamePhotoFile(readyPngPath, newName)
      }
      if (readyJpgPath) {
        const ext = path.extname(readyJpgPath)
        const newName = `${newDisplayName}${ext}`
        newReadyJpgPath = renamePhotoFile(readyJpgPath, newName)
      }

      // 8. SSD READY files (best-effort)
      if (ssdBase) {
        try {
          const ssdPicturesBase = path.join(np(ssdBase), projectName, 'PICTURES')
          const pngSsd = path.join(ssdPicturesBase, '3. READY', 'PNG', `${newDisplayName}.png`)
          const jpgSsd = path.join(ssdPicturesBase, '3. READY', 'JPG', `${newDisplayName}.jpg`)
          const oldPngSsd = path.join(ssdPicturesBase, '3. READY', 'PNG', `${path.basename(excelPath, '.xlsx')}.png`)
          const oldJpgSsd = path.join(ssdPicturesBase, '3. READY', 'JPG', `${path.basename(excelPath, '.xlsx')}.jpg`)
          if (fs.existsSync(oldPngSsd)) { fs.mkdirSync(path.dirname(pngSsd), { recursive: true }); safeRenameFile(oldPngSsd, pngSsd) }
          if (fs.existsSync(oldJpgSsd)) { fs.mkdirSync(path.dirname(jpgSsd), { recursive: true }); safeRenameFile(oldJpgSsd, jpgSsd) }
        } catch (err) {
          errors.push(`SSD READY rename failed: ${String(err)}`)
        }
      }

      // 9. Write backup index entry — caller handles full index; we just confirm success
      return {
        success: true,
        newExcelPath,
        updatedPhotos,
        newReadyPngPath,
        newReadyJpgPath,
        errors,
      }
    }
  )

  // ── Write the recipe index JSON backup to the project folder ─────────────
  ipcMain.handle(
    'recipe:write-index',
    async (_event, indexPath: string, content: string): Promise<{ success: boolean; error?: string }> => {
      try {
        fs.mkdirSync(path.dirname(np(indexPath)), { recursive: true })
        fs.writeFileSync(np(indexPath), content, 'utf-8')
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Generate a stable recipeUid and write it to Z52 of an existing file ──
  ipcMain.handle(
    'recipe:write-uid',
    async (_event, filePath: string, uid: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await writeExcelViaCOM([{
          filePath: np(filePath),
          updates: [{ sheet: 'Quote', cell: 'Z52', value: uid }],
        }])
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Generate a new stable UUID (for legacy file backfill) ─────────────────
  ipcMain.handle('recipe:generate-uid', () => randomUUID())
}
