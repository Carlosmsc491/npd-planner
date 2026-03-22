// src/renderer/src/utils/recipeValidation.ts
// Validation engine: 11 rules ported from EliteQuote validation_service.py

import { readExcelCells } from '../lib/recipeExcel'
import { normalizeRecipeName, parseRecipeNameFromFilename } from './recipeNaming'
import type {
  RecipeProjectConfig,
  RecipeSettings,
  ValidationChange,
  ValidationResult,
  RecipeRuleCells,
} from '../types'

// ── DC order matching distributionStart row offset ─────────────────────────

const DC_KEYS: Array<keyof import('../types').RecipeDistribution> = [
  'miami', 'newJersey', 'california', 'chicago', 'seattle', 'texas',
]

// ── Helpers ────────────────────────────────────────────────────────────────

function cellRowOffset(startCell: string, offset: number): string {
  // E.g. "AI15" + 1 → "AI16"
  const match = startCell.match(/^([A-Z]+)(\d+)$/)
  if (!match) return startCell
  return `${match[1]}${parseInt(match[2]) + offset}`
}

function num(val: string | undefined): number {
  const n = parseFloat(val ?? '0')
  return isNaN(n) ? 0 : n
}

// ── Main validation function ───────────────────────────────────────────────

export async function validateRecipeFile(
  filePath: string,
  projectConfig: RecipeProjectConfig,
  settings: RecipeSettings,
  currentUser: string
): Promise<ValidationResult> {
  const rc: RecipeRuleCells = settings.ruleCells
  const changes: ValidationChange[] = []
  let requiresManualUpdate = false

  // Build list of all cells to read up front
  const dcCells = DC_KEYS.map((_, i) => cellRowOffset(rc.distributionStart, i))
  const allCells = [
    rc.recipeName,
    rc.holiday,
    rc.customer,
    rc.dryPackSuggested,
    rc.dryPackActual,
    rc.wetPackFlag,
    rc.wetPackSuggested,
    rc.wetPackActual,
    rc.sleevePrice,
    rc.sleeveFlag,
    rc.stemCount,
    ...dcCells,
  ]

  let cellValues: Record<string, string> = {}
  try {
    cellValues = await readExcelCells(filePath, allCells)
  } catch (err) {
    throw new Error(`Cannot read Excel file: ${err instanceof Error ? err.message : String(err)}`)
  }

  const get = (cell: string) => (cellValues[cell] ?? '').trim()

  // ── R1 — Recipe Name Format ───────────────────────────────────────────────
  const rawName = get(rc.recipeName)
  const parsed = parseRecipeNameFromFilename(rawName)
  const normalized = normalizeRecipeName(parsed.price, parsed.option, parsed.name)
  if (normalized && normalized !== rawName) {
    changes.push({
      field:          'Recipe Name',
      cell:           rc.recipeName,
      currentValue:   rawName,
      suggestedValue: normalized,
      autoApply:      false,
      type:           'warning',
    })
  }

  // ── R2 — Holiday Detection Alignment ────────────────────────────────────
  const effectiveName = normalized || rawName
  const currentHoliday = get(rc.holiday)
  for (const [keyword, holidayValue] of Object.entries(settings.holidayMap)) {
    if (effectiveName.toUpperCase().includes(keyword.toUpperCase())) {
      if (currentHoliday !== holidayValue) {
        changes.push({
          field:          'Holiday',
          cell:           rc.holiday,
          currentValue:   currentHoliday,
          suggestedValue: holidayValue,
          autoApply:      true,
          type:           'warning',
        })
      }
      break
    }
  }

  // ── R3 — Dry Pack Sync ───────────────────────────────────────────────────
  const dryPackSugg = get(rc.dryPackSuggested)
  const dryPackActual = get(rc.dryPackActual)
  if (dryPackSugg && dryPackSugg !== dryPackActual) {
    changes.push({
      field:          'Dry Pack Actual',
      cell:           rc.dryPackActual,
      currentValue:   dryPackActual,
      suggestedValue: dryPackSugg,
      autoApply:      true,
      type:           'warning',
    })
  }

  // ── R4 — Wet Pack Sync ───────────────────────────────────────────────────
  const wetPackSugg = get(rc.wetPackSuggested)
  const wetPackActual = get(rc.wetPackActual)
  if (wetPackSugg && wetPackSugg !== wetPackActual) {
    changes.push({
      field:          'Wet Pack Actual',
      cell:           rc.wetPackActual,
      currentValue:   wetPackActual,
      suggestedValue: wetPackSugg,
      autoApply:      true,
      type:           'warning',
    })
  }

  // ── R5 — Sleeve Price Correction ─────────────────────────────────────────
  const currentSleevePrice = get(rc.sleevePrice)
  const fileName = filePath.split(/[\\/]/).pop() ?? ''
  const fileParsed = parseRecipeNameFromFilename(fileName)
  const sleeveFromPrice = settings.sleeveByPrice[fileParsed.price]
  const stemCount = get(rc.stemCount)
  const sleeveFromStems = settings.sleeveByStems[stemCount]

  const expectedSleeve = sleeveFromPrice ?? sleeveFromStems
  if (expectedSleeve !== undefined) {
    const expected = String(expectedSleeve)
    if (currentSleevePrice !== expected) {
      changes.push({
        field:          'Sleeve Price',
        cell:           rc.sleevePrice,
        currentValue:   currentSleevePrice,
        suggestedValue: expected,
        autoApply:      false,
        type:           'warning',
      })
    }
  } else {
    requiresManualUpdate = true
  }

  // ── R6 — Sleeve Flag Enforcement ─────────────────────────────────────────
  const sleevePrice = num(get(rc.sleevePrice))
  const sleeveFlag = get(rc.sleeveFlag)
  if (sleevePrice > 0 && sleeveFlag !== 'Y') {
    changes.push({
      field:          'Sleeve Flag',
      cell:           rc.sleeveFlag,
      currentValue:   sleeveFlag,
      suggestedValue: 'Y',
      autoApply:      true,
      type:           'warning',
    })
  }

  // ── R7 — Wet Pack Enforcement ─────────────────────────────────────────────
  if (projectConfig.wetPackDefault) {
    const wetPackFlag = get(rc.wetPackFlag)
    if (wetPackFlag !== 'Y') {
      changes.push({
        field:          'Wet Pack Flag',
        cell:           rc.wetPackFlag,
        currentValue:   wetPackFlag,
        suggestedValue: 'Y',
        autoApply:      true,
        type:           'warning',
      })
    }
  }

  // ── R8 — Miami Override ───────────────────────────────────────────────────
  const distValues = DC_KEYS.map((_, i) => num(get(dcCells[i])))
  const miamiVal = distValues[0]
  if (miamiVal === 100) {
    for (let i = 1; i < DC_KEYS.length; i++) {
      if (distValues[i] > 0) {
        changes.push({
          field:          `Distribution — ${DC_KEYS[i]}`,
          cell:           dcCells[i],
          currentValue:   String(distValues[i]),
          suggestedValue: '0',
          autoApply:      true,
          type:           'warning',
        })
      }
    }
  }

  // ── R9 — Distribution Over 100% ──────────────────────────────────────────
  const totalDist = distValues.reduce((a, b) => a + b, 0)
  if (totalDist > 100) {
    changes.push({
      field:          'Distribution Total',
      cell:           rc.distributionStart,
      currentValue:   `${totalDist}%`,
      suggestedValue: '≤ 100%',
      autoApply:      false,
      type:           'error',
    })
  }

  // ── R10 — Customer Enforcement ───────────────────────────────────────────
  const currentCustomer = get(rc.customer)
  if (projectConfig.customerDefault && currentCustomer !== projectConfig.customerDefault) {
    changes.push({
      field:          'Customer',
      cell:           rc.customer,
      currentValue:   currentCustomer,
      suggestedValue: projectConfig.customerDefault,
      autoApply:      true,
      type:           'warning',
    })
  }

  // ── R11 — Final Naming (informational) ──────────────────────────────────
  const finalName = `${effectiveName} DONE BY ${currentUser.toUpperCase()}.xlsx`
  changes.push({
    field:          'Final File Name',
    cell:           '—',
    currentValue:   fileName,
    suggestedValue: finalName,
    autoApply:      true,
    type:           'info',
  })

  const valid = !changes.some((c) => c.type === 'error')
  return { valid, changes, requiresManualUpdate }
}
