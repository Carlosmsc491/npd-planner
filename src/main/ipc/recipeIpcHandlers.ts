// src/main/ipc/recipeIpcHandlers.ts
// IPC handlers for Recipe Manager — runs in Electron main process (Node.js)
// Uses exceljs for Excel read/write operations

import { ipcMain, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import ExcelJS from 'exceljs'

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
}

interface RecipeSpec {
  recipeId: string
  relativePath: string
  displayName: string
  price: string
  option: string
  name: string
  holidayOverride: string
  customerOverride: string
  wetPackOverride: string
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

/** Set a cell value, preserving existing formula structure is not needed — we overwrite values */
function setCellValue(
  ws: ExcelJS.Worksheet,
  cellAddr: string,
  value: string | number | boolean | null
): void {
  const cell = ws.getCell(cellAddr)
  cell.value = value
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

/** Walk a directory recursively and collect all .xlsx files */
function walkXlsx(
  rootPath: string,
  currentPath: string,
  results: RecipeScannedFile[]
): void {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      // Skip the _project metadata folder
      if (entry.name === '_project') continue
      walkXlsx(rootPath, fullPath, results)
    } else if (entry.isFile() && entry.name.endsWith('.xlsx') && !entry.name.startsWith('~$')) {
      const relativePath = path.relative(rootPath, fullPath)
      const parsed = parseRecipeFilename(entry.name)
      results.push({
        relativePath,
        displayName: parsed.displayName,
        price: parsed.price,
        option: parsed.option,
        name: parsed.name,
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

export function registerRecipeHandlers(): void {

  // ── Read multiple cells from an Excel file ────────────────────────────────
  ipcMain.handle(
    'recipe:readCells',
    async (_event, filePath: string, cells: string[]): Promise<Record<string, string>> => {
      try {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(filePath)
        const ws = workbook.worksheets[0]
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
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(filePath)
        const ws = workbook.worksheets[0]
        if (!ws) throw new Error('No worksheet found in file')

        for (const change of changes) {
          setCellValue(ws, change.cell, change.value)
        }

        await workbook.xlsx.writeFile(filePath)
        return { success: true }
      } catch (err) {
        console.error('recipe:writeCells error:', err)
        throw err
      }
    }
  )

  // ── Generate a new Excel file from a template ─────────────────────────────
  ipcMain.handle(
    'recipe:generateFromTemplate',
    async (
      _event,
      templatePath: string,
      outputPath: string,
      recipeData: RecipeSpec
    ): Promise<{ success: boolean }> => {
      try {
        // Ensure output directory exists
        fs.mkdirSync(path.dirname(outputPath), { recursive: true })

        // Copy template to output path
        fs.copyFileSync(templatePath, outputPath)

        // Write initial recipe data if any values are provided
        if (recipeData.displayName || recipeData.holidayOverride || recipeData.customerOverride) {
          const workbook = new ExcelJS.Workbook()
          await workbook.xlsx.readFile(outputPath)
          const ws = workbook.worksheets[0]
          if (ws) {
            if (recipeData.displayName) setCellValue(ws, 'D3', recipeData.displayName)
            if (recipeData.holidayOverride) setCellValue(ws, 'D6', recipeData.holidayOverride)
            if (recipeData.customerOverride) setCellValue(ws, 'D7', recipeData.customerOverride)
            if (recipeData.wetPackOverride) setCellValue(ws, 'AA40', recipeData.wetPackOverride)
            await workbook.xlsx.writeFile(outputPath)
          }
        }

        return { success: true }
      } catch (err) {
        console.error('recipe:generateFromTemplate error:', err)
        throw err
      }
    }
  )

  // ── Rename an Excel file ──────────────────────────────────────────────────
  ipcMain.handle(
    'recipe:renameFile',
    async (_event, oldPath: string, newPath: string): Promise<{ success: boolean }> => {
      try {
        if (isFileLockedByExcel(oldPath)) {
          throw new Error('File is currently open in Excel. Close it before renaming.')
        }
        fs.renameSync(oldPath, newPath)
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
        return isFileLockedByExcel(filePath)
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
        fs.mkdirSync(folderPath, { recursive: true })
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
        if (!fs.existsSync(rootPath)) {
          return []
        }
        const results: RecipeScannedFile[] = []
        walkXlsx(rootPath, rootPath, results)
        return results
      } catch (err) {
        console.error('recipe:scanProject error:', err)
        throw err
      }
    }
  )

  // ── Open a file with its default application (Excel) ─────────────────────
  ipcMain.handle(
    'recipe:openInExcel',
    async (_event, filePath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await shell.openPath(filePath)
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
}
