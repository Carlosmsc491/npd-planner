// src/renderer/src/lib/recipeExcel.ts
// Typed wrappers over recipe IPC calls so components never call electronAPI directly

export async function readExcelCells(
  filePath: string,
  cells: string[]
): Promise<Record<string, string>> {
  return window.electronAPI.recipeReadCells(filePath, cells)
}

export async function writeExcelCells(
  filePath: string,
  changes: { cell: string; value: string | number | boolean | null }[]
): Promise<void> {
  const result = await window.electronAPI.recipeWriteCells(filePath, changes)
  if (!result.success) {
    throw new Error('Failed to write Excel cells')
  }
}

export async function isExcelFileOpen(filePath: string): Promise<boolean> {
  return window.electronAPI.recipeIsFileOpen(filePath)
}

export async function openInExcel(filePath: string): Promise<void> {
  const result = await window.electronAPI.recipeOpenInExcel(filePath)
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to open file in Excel')
  }
}
