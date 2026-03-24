// src/renderer/src/components/recipes/wizard/WizardStepStructure.tsx
// Step 3: Build the folder/recipe tree — each recipe inherits Step 2 defaults, overridable

import { useState } from 'react'
import { Plus, Trash2, FolderPlus, ChevronRight, FileSpreadsheet, Upload, FolderDown } from 'lucide-react'
import { nanoid } from 'nanoid'
import { normalizeRecipeName } from '../../../utils/recipeNaming'
import { DistributionEditor } from './WizardStepRules'
import {
  RECIPE_CUSTOMER_OPTIONS,
  RECIPE_HOLIDAY_OPTIONS,
  DEFAULT_RECIPE_DISTRIBUTION,
} from '../../../types'
import type { RecipeDistribution } from '../../../types'

// ── Public types ───────────────────────────────────────────────────────────

export interface WizardRecipe {
  id: string
  price: string
  option: string
  name: string
  customerOverride: string
  holidayOverride: string
  wetPackOverride: string          // 'Y' | 'N'
  boxTypeOverride: string          // Z6: 'QUARTER' | 'HALF ELITE' | etc.
  pickNeededOverride: string       // AC23: 'Y' | 'N'
  distributionOverride: RecipeDistribution
}

export interface WizardFolder {
  id: string
  name: string
  recipes: WizardRecipe[]
}

export interface WizardDefaults {
  customerDefault: string
  holidayDefault: string
  wetPackDefault: boolean
  distributionDefault: RecipeDistribution
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  folders: WizardFolder[]
  defaults: WizardDefaults
  sourceMode: 'from_scratch' | 'import'
  onChange: (folders: WizardFolder[]) => void
}

// ── Import helpers ─────────────────────────────────────────────────────────

// Import format: A=name (folder grouper), B=SRP, C=Box Type, D=Pick Needed, E=holiday
type ImportRow = { name: string; srp: string; boxType: string; pickNeeded: string; holiday: string }

/**
 * Resolve Z6 box type value and wet pack flag from the raw Box Type string.
 * K WET / WET PACK / K BOX → HALF ELITE + wet pack Y
 * Any HALF variant          → HALF ELITE
 * Otherwise                 → uppercase as-is
 */
function resolveBoxType(raw: string): { boxTypeOverride: string; wetPackOverride: string } {
  const upper = raw.trim().toUpperCase()
  if (upper.includes('WET') || upper.includes('K BOX') || upper.includes('K WET')) {
    return { boxTypeOverride: 'HALF ELITE', wetPackOverride: 'Y' }
  }
  if (upper.includes('HALF')) {
    return { boxTypeOverride: 'HALF ELITE', wetPackOverride: '' }
  }
  return { boxTypeOverride: upper || 'QUARTER', wetPackOverride: '' }
}

function rowsToFolders(rows: ImportRow[], defaults: WizardDefaults): WizardFolder[] {
  const folderMap = new Map<string, WizardRecipe[]>()
  for (const row of rows) {
    const folderName = row.name.trim() || 'General'
    if (!folderMap.has(folderName)) folderMap.set(folderName, [])
    const { boxTypeOverride, wetPackOverride } = resolveBoxType(row.boxType)
    const effectiveWetPack = wetPackOverride || (defaults.wetPackDefault ? 'Y' : 'N')
    const pickNorm = row.pickNeeded.trim().toUpperCase()
    const pickNeededOverride = (pickNorm === 'YES' || pickNorm === 'Y') ? 'Y' : 'N'
    const holidayOverride = row.holiday.trim().toUpperCase() || defaults.holidayDefault
    folderMap.get(folderName)!.push({
      id:                   nanoid(),
      price:                row.srp.trim(),
      option:               '',
      name:                 row.name.trim().toUpperCase(),
      customerOverride:     defaults.customerDefault,
      holidayOverride,
      wetPackOverride:      effectiveWetPack,
      boxTypeOverride,
      pickNeededOverride,
      distributionOverride: { ...defaults.distributionDefault },
    })
  }
  return Array.from(folderMap.entries()).map(([name, recipes]) => ({
    id: nanoid(), name, recipes,
  }))
}

export default function WizardStepStructure({ folders, defaults, sourceMode, onChange }: Props) {
  const [importTemplatePath, setImportTemplatePath] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  async function handleCreateTemplate() {
    const folder = await window.electronAPI.selectFolder()
    if (!folder) return
    const dest = `${folder}/import_template.xlsx`
    const result = await window.electronAPI.recipeCreateImportTemplate(dest)
    if (result.success) {
      setImportTemplatePath(dest)
      setImportStatus(`Template created: ${dest}`)
      setImportError(null)
    } else {
      setImportError(result.error ?? 'Failed to create template')
    }
  }

  async function handleOpenTemplate() {
    if (!importTemplatePath) return
    await window.electronAPI.recipeOpenInExcel(importTemplatePath)
  }

  async function handleLoadImport() {
    const file = await window.electronAPI.selectFile()
    if (!file) return
    setImportError(null)
    const result = await window.electronAPI.recipeParseImportExcel(file)
    if (!result.success || !result.rows || result.rows.length === 0) {
      setImportError(result.error ?? 'No valid rows found in the file')
      return
    }
    const built = rowsToFolders(result.rows, defaults)
    onChange(built)
    setImportStatus(`Imported ${result.rows.length} recipes into ${built.length} folder(s).`)
  }

  function makeNewRecipe(): WizardRecipe {
    return {
      id:                   nanoid(),
      price:                '',
      option:               '',
      name:                 '',
      customerOverride:     defaults.customerDefault,
      holidayOverride:      defaults.holidayDefault,
      wetPackOverride:      defaults.wetPackDefault ? 'Y' : 'N',
      boxTypeOverride:      'QUARTER',
      pickNeededOverride:   'N',
      distributionOverride: { ...defaults.distributionDefault },
    }
  }

  function addFolder() {
    onChange([...folders, { id: nanoid(), name: 'New Folder', recipes: [] }])
  }

  function removeFolder(folderId: string) {
    onChange(folders.filter((f) => f.id !== folderId))
  }

  function updateFolder(folderId: string, updates: Partial<WizardFolder>) {
    onChange(folders.map((f) => (f.id === folderId ? { ...f, ...updates } : f)))
  }

  function addRecipe(folderId: string) {
    onChange(
      folders.map((f) =>
        f.id === folderId
          ? { ...f, recipes: [...f.recipes, makeNewRecipe()] }
          : f
      )
    )
  }

  function removeRecipe(folderId: string, recipeId: string) {
    onChange(
      folders.map((f) =>
        f.id === folderId
          ? { ...f, recipes: f.recipes.filter((r) => r.id !== recipeId) }
          : f
      )
    )
  }

  function updateRecipe(folderId: string, recipeId: string, updates: Partial<WizardRecipe>) {
    onChange(
      folders.map((f) =>
        f.id === folderId
          ? {
              ...f,
              recipes: f.recipes.map((r) =>
                r.id === recipeId ? { ...r, ...updates } : r
              ),
            }
          : f
      )
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Import controls (only in import mode) ───────────────────────── */}
      {sourceMode === 'import' && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
            Import flow: create the template → fill A (Recipe Name) and B (Folder) → load the file.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCreateTemplate}
              className="flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-blue-900/30 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors"
            >
              <FileSpreadsheet size={12} />
              Create Import Template
            </button>
            <button
              onClick={handleOpenTemplate}
              disabled={!importTemplatePath}
              className="flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-blue-900/30 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FolderDown size={12} />
              Open in Excel
            </button>
            <button
              onClick={handleLoadImport}
              className="flex items-center gap-1.5 rounded-lg border border-green-300 dark:border-green-600 bg-white dark:bg-green-900/20 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-800/30 transition-colors"
            >
              <Upload size={12} />
              Load Completed Import
            </button>
          </div>
          {importStatus && (
            <p className="text-xs text-green-600 dark:text-green-400">{importStatus}</p>
          )}
          {importError && (
            <p className="text-xs text-red-500 dark:text-red-400">{importError}</p>
          )}
        </div>
      )}

      {folders.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
          <FolderPlus size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No folders yet. Add your first folder.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {folders.map((folder) => (
            <FolderBlock
              key={folder.id}
              folder={folder}
              defaults={defaults}
              onFolderChange={(u) => updateFolder(folder.id, u)}
              onFolderDelete={() => removeFolder(folder.id)}
              onAddRecipe={() => addRecipe(folder.id)}
              onRecipeChange={(rId, u) => updateRecipe(folder.id, rId, u)}
              onRecipeDelete={(rId) => removeRecipe(folder.id, rId)}
            />
          ))}
        </div>
      )}

      <button
        onClick={addFolder}
        className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full justify-center"
      >
        <Plus size={14} />
        Add Folder
      </button>
    </div>
  )
}

// ── FolderBlock ────────────────────────────────────────────────────────────

interface FolderBlockProps {
  folder: WizardFolder
  defaults: WizardDefaults
  onFolderChange: (u: Partial<WizardFolder>) => void
  onFolderDelete: () => void
  onAddRecipe: () => void
  onRecipeChange: (recipeId: string, u: Partial<WizardRecipe>) => void
  onRecipeDelete: (recipeId: string) => void
}

function FolderBlock({
  folder,
  defaults,
  onFolderChange,
  onFolderDelete,
  onAddRecipe,
  onRecipeChange,
  onRecipeDelete,
}: FolderBlockProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Folder header */}
      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm">📁</span>
        <input
          type="text"
          value={folder.name}
          onChange={(e) => onFolderChange({ name: e.target.value })}
          placeholder="Folder name"
          className="flex-1 bg-transparent text-sm font-medium text-gray-900 dark:text-white focus:outline-none placeholder-gray-400"
        />
        <button
          onClick={onFolderDelete}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Delete folder"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Recipe rows */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
        {folder.recipes.map((recipe) => (
          <RecipeEditor
            key={recipe.id}
            recipe={recipe}
            defaults={defaults}
            onChange={(u) => onRecipeChange(recipe.id, u)}
            onDelete={() => onRecipeDelete(recipe.id)}
          />
        ))}
      </div>

      {/* Add recipe button */}
      <div className="px-3 py-2 bg-white dark:bg-gray-900">
        <button
          onClick={onAddRecipe}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <Plus size={12} />
          Add Recipe
        </button>
      </div>
    </div>
  )
}

// ── RecipeEditor ───────────────────────────────────────────────────────────

interface RecipeEditorProps {
  recipe: WizardRecipe
  defaults: WizardDefaults
  onChange: (u: Partial<WizardRecipe>) => void
  onDelete: () => void
}

function RecipeEditor({ recipe, defaults, onChange, onDelete }: RecipeEditorProps) {
  const [expanded, setExpanded] = useState(false)
  const [overridesOpen, setOverridesOpen] = useState(false)

  const preview = normalizeRecipeName(recipe.price, recipe.option, recipe.name)

  // Detect overrides
  const hasCustomerOverride = recipe.customerOverride !== defaults.customerDefault
  const hasHolidayOverride  = recipe.holidayOverride  !== defaults.holidayDefault
  const hasWetPackOverride  = recipe.wetPackOverride  !== (defaults.wetPackDefault ? 'Y' : 'N')
  const hasDistribOverride  =
    JSON.stringify(recipe.distributionOverride) !== JSON.stringify(defaults.distributionDefault)

  const overrideCount = [hasCustomerOverride, hasHolidayOverride, hasWetPackOverride, hasDistribOverride]
    .filter(Boolean).length

  return (
    <div className="bg-white dark:bg-gray-900">
      {/* ── Collapsed row ── */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
        >
          <ChevronRight
            size={13}
            className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          />
        </button>

        {/* Preview name or placeholder */}
        <span className="flex-1 text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
          {preview
            ? <>{preview}<span className="text-gray-400">.xlsx</span></>
            : <span className="text-gray-300 dark:text-gray-600 italic">new recipe…</span>}
        </span>

        {/* Override badges */}
        {overrideCount > 0 && (
          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-full px-2 py-0.5 shrink-0">
            {overrideCount} override{overrideCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Delete */}
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
          title="Remove recipe"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* ── Expanded form ── */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">

          {/* Basic fields */}
          <div className="pt-2 flex items-center gap-2">
            <input
              type="text"
              value={recipe.price}
              onChange={(e) => onChange({ price: e.target.value })}
              placeholder="$12.99"
              className="w-20 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
            />
            <select
              value={recipe.option}
              onChange={(e) => onChange({ option: e.target.value })}
              className="w-14 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
            >
              <option value="">—</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
            <input
              type="text"
              value={recipe.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Recipe name"
              className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Name preview */}
          <p className="text-[10px] font-mono pl-0.5">
            {preview
              ? <span className="text-green-600 dark:text-green-400">→ {preview}.xlsx</span>
              : <span className="text-gray-300 dark:text-gray-600 italic">e.g. $12.99 A VALENTINE.xlsx</span>}
          </p>

          {/* Override section */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setOverridesOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/60 text-left hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
            >
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Override Project Rules
              </span>
              <div className="flex items-center gap-2">
                {overrideCount > 0 && (
                  <span className="text-[10px] text-blue-500">{overrideCount} changed</span>
                )}
                <ChevronRight
                  size={13}
                  className={`text-gray-400 transition-transform duration-150 ${overridesOpen ? 'rotate-90' : ''}`}
                />
              </div>
            </button>

            {overridesOpen && (
              <div className="px-3 py-3 space-y-3">

                {/* Customer */}
                <OverrideField
                  label="Customer"
                  isOverridden={hasCustomerOverride}
                >
                  <select
                    value={recipe.customerOverride}
                    onChange={(e) => onChange({ customerOverride: e.target.value })}
                    className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
                  >
                    {RECIPE_CUSTOMER_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}{opt === defaults.customerDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </OverrideField>

                {/* Holiday */}
                <OverrideField
                  label="Holiday"
                  isOverridden={hasHolidayOverride}
                >
                  <select
                    value={recipe.holidayOverride}
                    onChange={(e) => onChange({ holidayOverride: e.target.value })}
                    className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
                  >
                    {RECIPE_HOLIDAY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}{opt === defaults.holidayDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </OverrideField>

                {/* Wet Pack */}
                <OverrideField
                  label="Wet Pack"
                  isOverridden={hasWetPackOverride}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onChange({ wetPackOverride: recipe.wetPackOverride === 'Y' ? 'N' : 'Y' })}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                        recipe.wetPackOverride === 'Y'
                          ? 'bg-green-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          recipe.wetPackOverride === 'Y' ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {recipe.wetPackOverride === 'Y' ? 'Yes' : 'No'}
                    </span>
                  </div>
                </OverrideField>

                {/* Distribution */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">
                      Distribution
                    </span>
                    {hasDistribOverride && (
                      <span className="text-[10px] text-blue-500 italic">(overriding default)</span>
                    )}
                  </div>
                  <DistributionEditor
                    value={recipe.distributionOverride}
                    onChange={(dist) => onChange({ distributionOverride: dist })}
                  />
                  <button
                    onClick={() => onChange({ distributionOverride: { ...DEFAULT_RECIPE_DISTRIBUTION } })}
                    className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                  >
                    Reset to default
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── OverrideField helper ───────────────────────────────────────────────────

function OverrideField({
  label,
  isOverridden,
  children,
}: {
  label: string
  isOverridden: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">
        {label}
      </span>
      {children}
      {isOverridden && (
        <span className="text-[10px] text-blue-500 italic shrink-0 ml-1">(overriding default)</span>
      )}
    </div>
  )
}
