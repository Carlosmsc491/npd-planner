// src/renderer/src/components/recipes/wizard/NewRecipeProjectWizard.tsx
// 3-step wizard: Basics → Rules → Structure → Create Project

import React, { useState, useEffect } from 'react'
import { customAlphabet } from 'nanoid'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Check, FolderPlus, Copy, FileSpreadsheet, Database, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import { createRecipeProject, upsertRecipeFile, getRecipeSettings } from '../../../lib/recipeFirestore'
import { normalizeRecipeName, sanitizeWindowsName } from '../../../utils/recipeNaming'
import { detectHolidayFromName } from '../../../utils/holidayDetect'
import { toLibraryRelativePath } from '../../../utils/photoUtils'
import {
  RECIPE_CUSTOMER_OPTIONS,
  RECIPE_HOLIDAY_OPTIONS,
  DEFAULT_RECIPE_DISTRIBUTION,
  SLEEVE_PRICE_MAP,
  DISTRIBUTION_CELLS,
} from '../../../types'
import type { RecipeDistribution } from '../../../types'
import { Timestamp } from 'firebase/firestore'
import WizardStepBasics from './WizardStepBasics'
import WizardStepRules from './WizardStepRules'
import WizardStepStructure from './WizardStepStructure'
import WizardStepReview from './WizardStepReview'
import type { WizardFolder, WizardDefaults, WizardRecipe } from './WizardStepStructure'
import type { ImportRow } from './WizardStepBasics'
import AppLayout from '../../ui/AppLayout'

// recipeUid must be filesystem/manifest-safe: alphanumeric only. nanoid's default
// alphabet includes "_" and "-", which the photo-manifest layer treats as
// conflict-copy separators — a uid containing "_" got truncated and its manifest
// file deleted. Generating uids without those characters avoids that class entirely.
const genRecipeUid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16)

// ─────────────────────────────────────────
// Progress overlay types
// ─────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'error'

interface ProgressStep {
  id: string
  label: string
  detail?: string
  status: StepStatus
}

// ─────────────────────────────────────────
// Wizard data shape
// ─────────────────────────────────────────

interface WizardData {
  // Step 1
  name: string
  rootPath: string
  templatePath: string
  sourceMode: 'from_scratch' | 'import'
  dueDate: string | null
  useProjectNameForSpec: boolean
  specSheetName: string
  // Step 2
  customerDefault: string
  holidayDefault: string
  wetPackDefault: boolean
  distribution: RecipeDistribution
  // Step 3
  folders: WizardFolder[]
}

const STEP_LABELS = ['Basics', 'Rules', 'Structure', 'Review']

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export default function NewRecipeProjectWizard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [step, setStep] = useState(1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressStep[]>([])
  const [folderExistsError, setFolderExistsError] = useState<string | null>(null)

  const [data, setData] = useState<WizardData>({
    name: '',
    rootPath: localStorage.getItem('npd:projects_root') ?? '',
    templatePath: '',
    sourceMode: 'from_scratch',
    dueDate: null,
    useProjectNameForSpec: true,
    specSheetName: '',
    customerDefault: RECIPE_CUSTOMER_OPTIONS[0],
    holidayDefault: RECIPE_HOLIDAY_OPTIONS[0],
    wetPackDefault: false,
    distribution: { ...DEFAULT_RECIPE_DISTRIBUTION },
    folders: [],
  })

  function patchData(updates: Partial<WizardData>) {
    if ('name' in updates || 'rootPath' in updates) setFolderExistsError(null)
    setData((prev) => ({ ...prev, ...updates }))
  }

  // Load the recipe settings maps up front so step 3 can show the holiday/sleeve
  // that will be auto-detected from each recipe name (live preview).
  const [holidayMap, setHolidayMap] = useState<Record<string, string>>({})
  const [sleeveMap, setSleeveMap] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!user) return
    getRecipeSettings(user.uid)
      .then((s) => { setHolidayMap(s?.holidayMap ?? {}); setSleeveMap(s?.sleeveByPrice ?? {}) })
      .catch(() => { /* defaults stay empty */ })
  }, [user])

  // Build the structure from validated import rows (all into one folder named after
  // the project). Applies the current project defaults to each recipe.
  function handleImportRows(rows: ImportRow[]) {
    if (rows.length === 0) return
    const recipes: WizardRecipe[] = rows.map((r) => ({
      id: genRecipeUid(),
      price: r.price,
      option: r.option,
      name: r.name,
      customerOverride: data.customerDefault,
      holidayOverride: data.holidayDefault,
      wetPackOverride: data.wetPackDefault ? 'Y' : 'N',
      boxTypeOverride: 'QUARTER',
      pickNeededOverride: r.pickNeeded,
      distributionOverride: { ...data.distribution },
    }))
    const folder: WizardFolder = {
      id: genRecipeUid(),
      name: (data.name.trim() || 'IMPORTED').toUpperCase(),
      recipes,
    }
    patchData({ folders: [folder] })
  }

  // ── Validation ──────────────────────────────────────────────────────────

  function isStep1Valid(): boolean {
    return data.name.trim().length > 0 && data.rootPath.length > 0 && data.templatePath.length > 0
  }

  function isStep2Valid(): boolean {
    // Distribution is how the ordered bouquets split across production locations,
    // so it MUST total exactly 100% (e.g. 100% Miami, or 20% + 80%). Less or more
    // makes no sense for billing, so we block advancing until it's exactly 100.
    const total = Object.values(data.distribution).reduce((a, b) => a + b, 0)
    return total === 100
  }

  function canGoNext(): boolean {
    if (step === 1) return isStep1Valid()
    if (step === 2) return isStep2Valid()
    return true
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  async function goNext() {
    if (step === 1) {
      setFolderExistsError(null)
      const folderName = sanitizeWindowsName(data.name.trim())
      const proposedPath = `${data.rootPath}/${folderName}`
      try {
        const exists = await window.electronAPI.recipePathExists(proposedPath)
        if (exists) {
          setFolderExistsError(`A folder named "${folderName}" already exists in the selected location. Choose a different project name.`)
          return
        }
      } catch { /* ignore — let creation step surface any real FS error */ }
    }
    if (step < 4) setStep(step + 1)
  }

  function goBack() {
    if (step > 1) setStep(step - 1)
  }

  // ── Create Project ───────────────────────────────────────────────────────

  function initProgress(totalFiles: number): ProgressStep[] {
    return [
      { id: 'folders',  label: 'Creating folders',                              status: 'pending' },
      { id: 'copy',     label: `Copying templates (0 / ${totalFiles})`,         status: 'pending' },
      { id: 'excel',    label: `Writing Excel data (${totalFiles} files)`,      status: 'pending' },
      { id: 'database', label: `Saving to database (${totalFiles} recipes)`,    status: 'pending' },
      { id: 'done',     label: 'Project ready!',                                status: 'pending' },
    ]
  }

  function markStep(steps: ProgressStep[], id: string, status: StepStatus, detail?: string): ProgressStep[] {
    return steps.map((s) => s.id === id ? { ...s, status, detail: detail ?? s.detail } : s)
  }

  async function handleCreate() {
    if (!user) {
      setError('Session expired. Please log in again.')
      return
    }
    setError(null)

    // Use the SAME configurable maps as the mark-done validation, so creation and
    // review never disagree. Fall back to the static map if settings aren't set.
    const recipeSettings = await getRecipeSettings(user.uid).catch(() => null)
    const sleeveMap  = recipeSettings?.sleeveByPrice ?? {}
    const holidayMap = recipeSettings?.holidayMap ?? {}

    const totalFiles = data.folders.reduce((n, f) => n + f.recipes.length, 0)
    let steps = initProgress(totalFiles)
    setProgress(steps)
    setCreating(true)

    console.log('[WIZARD] ── handleCreate START ────────────────────────────')
    console.log('[WIZARD] Project name   :', data.name.trim())
    console.log('[WIZARD] Root path      :', data.rootPath)
    console.log('[WIZARD] Template       :', data.templatePath)
    console.log('[WIZARD] Source mode    :', data.sourceMode)
    console.log('[WIZARD] Folders        :', data.folders.length)
    console.log('[WIZARD] Total recipes  :', totalFiles)

    try {
      const projectRoot = `${data.rootPath}/${sanitizeWindowsName(data.name.trim())}`
      console.log('[WIZARD] Project root   :', projectRoot)

      // ── Step 1: Create folders ─────────────────────────────────────────────
      console.log('[WIZARD] ── STEP 1: Create folders ──')
      steps = markStep(steps, 'folders', 'running', 'Creating project directory…')
      setProgress([...steps])

      console.log('[WIZARD]   mkdir:', projectRoot)
      await window.electronAPI.recipeCreateFolder(projectRoot)
      console.log('[WIZARD]   mkdir:', `${projectRoot}/_project`)
      await window.electronAPI.recipeCreateFolder(`${projectRoot}/_project`)
      for (const folder of data.folders) {
        const safeName = sanitizeWindowsName(folder.name)
        console.log('[WIZARD]   mkdir:', `${projectRoot}/${safeName}`)
        await window.electronAPI.recipeCreateFolder(`${projectRoot}/${safeName}`)
      }

      steps = markStep(steps, 'folders', 'done')
      setProgress([...steps])
      console.log('[WIZARD]   STEP 1 done')

      // ── Step 2: Copy template files ────────────────────────────────────────
      console.log('[WIZARD] ── STEP 2: Copy templates ──')
      steps = markStep(steps, 'copy', 'running')
      setProgress([...steps])

      const batchUpdates: Array<{ filePath: string; updates: Array<{ sheet: string; cell: string; value: string }> }> = []
      // Map outputPath → recipeUid so we can persist it to Firestore in step 4
      const recipeUidByPath = new Map<string, string>()
      let copied = 0

      for (const folder of data.folders) {
        const safeFolderName = sanitizeWindowsName(folder.name)
        const folderPath = `${projectRoot}/${safeFolderName}`
        console.log('[WIZARD]   folder:', folder.name, `(${folder.recipes.length} recipes)`)
        for (const recipe of folder.recipes) {
          const normalizedName = sanitizeWindowsName(normalizeRecipeName(recipe.price, recipe.option, recipe.name))
          if (!normalizedName) {
            console.warn('[WIZARD]   SKIP (empty normalizedName):', recipe)
            continue
          }

          const outputPath = `${folderPath}/${normalizedName}.xlsx`
          const priceKey = recipe.price.startsWith('$') ? recipe.price : `$${recipe.price}`
          // Sleeve: configurable settings map first, static map as fallback.
          const sleevePrice = sleeveMap[priceKey] || SLEEVE_PRICE_MAP[priceKey] || ''
          const requiresManualUpdate = !sleevePrice
          // Holiday: detect from the NAME via the dictionary (never changes the name).
          // Respect an explicit user pick (override ≠ default); otherwise use the
          // detected holiday, else the project default.
          const detectedHoliday = detectHolidayFromName(recipe.name, holidayMap)
          const userPickedHoliday = !!recipe.holidayOverride && recipe.holidayOverride !== data.holidayDefault
          const resolvedHoliday = userPickedHoliday
            ? recipe.holidayOverride
            : (detectedHoliday || recipe.holidayOverride || data.holidayDefault || '')

          console.log(`[WIZARD]   copy [${copied + 1}/${totalFiles}]: ${normalizedName}`)
          console.log('[WIZARD]     → output:', outputPath)

          const recipeSpec = {
            recipeId: recipe.id,
            relativePath: `${safeFolderName}/${normalizedName}.xlsx`,
            projectName: data.name.trim(),
            displayName: normalizedName,
            price: recipe.price,
            option: recipe.option,
            name: recipe.name,
            holidayOverride: resolvedHoliday,
            customerOverride: recipe.customerOverride,
            wetPackOverride: recipe.wetPackOverride,
            boxTypeOverride: recipe.boxTypeOverride,
            pickNeededOverride: recipe.pickNeededOverride,
            distributionOverride: recipe.distributionOverride,
            requiresManualUpdate,
          }

          await window.electronAPI.recipeGenerateFromTemplate(data.templatePath, outputPath, recipeSpec)
          copied++
          console.log(`[WIZARD]     ✓ copied ${copied}/${totalFiles}`)

          steps = markStep(steps, 'copy', 'running', `Copying file ${copied} of ${totalFiles}… ${normalizedName}`)
          setProgress([...steps])

          // Distribution cells: written as ratios (divide by 100)
          const distUpdates = (Object.entries(DISTRIBUTION_CELLS) as [keyof RecipeDistribution, string][])
            .map(([key, cell]) => ({
              sheet: 'Quote',
              cell,
              value: String((recipe.distributionOverride[key] ?? 0) / 100),
            }))

          const recipeUid = genRecipeUid()
          recipeUidByPath.set(outputPath, recipeUid)

          batchUpdates.push({
            filePath: outputPath,
            updates: [
              { sheet: 'Quote',      cell: 'D3',   value: normalizedName },
              { sheet: 'Quote',      cell: 'Z52',  value: recipeUid },
              { sheet: 'Quote',      cell: 'D6',   value: resolvedHoliday },
              { sheet: 'Quote',      cell: 'D7',   value: recipe.customerOverride   || '' },
              { sheet: 'Quote',      cell: 'AA40', value: recipe.wetPackOverride    || '' },
              { sheet: 'Quote',      cell: 'Z6',   value: recipe.boxTypeOverride    || '' },
              { sheet: 'Quote',      cell: 'AC23', value: recipe.pickNeededOverride || '' },
              { sheet: 'Quote',      cell: 'AB25', value: sleevePrice },
              { sheet: 'Quote',      cell: 'AC25', value: sleevePrice ? 'Y' : '' },
              { sheet: 'Spec Sheet', cell: 'E4',   value: data.useProjectNameForSpec ? data.name.trim() : (data.specSheetName.trim() || data.name.trim()) },
              ...distUpdates,
            ],
          })
        }
      }

      steps = markStep(steps, 'copy', 'done')
      setProgress([...steps])
      console.log('[WIZARD]   STEP 2 done — files copied:', copied)

      // ── Step 3: Write Excel cells via COM (one session) ────────────────────
      console.log('[WIZARD] ── STEP 3: Excel batch write ──')
      console.log('[WIZARD]   batchUpdates count:', batchUpdates.length)
      if (batchUpdates.length > 0) {
        steps = markStep(steps, 'excel', 'running', 'Opening Excel — this may take a moment…')
        setProgress([...steps])

        console.log('[WIZARD]   calling recipeBatchWriteCells…')
        const t0 = performance.now()
        await window.electronAPI.recipeBatchWriteCells(batchUpdates)
        console.log(`[WIZARD]   recipeBatchWriteCells done in ${Math.round(performance.now() - t0)} ms`)

        steps = markStep(steps, 'excel', 'done')
        setProgress([...steps])
      } else {
        console.log('[WIZARD]   no batch updates — skipping Excel step')
        steps = markStep(steps, 'excel', 'done')
        setProgress([...steps])
      }
      console.log('[WIZARD]   STEP 3 done')

      // ── Step 4: Save to Firestore ──────────────────────────────────────────
      console.log('[WIZARD] ── STEP 4: Firestore save ──')
      steps = markStep(steps, 'database', 'running', 'Creating project record…')
      setProgress([...steps])

      // Compute portable relative path from the OneDrive library root.
      // Stored relative to the library root (not the SP subfolder) so projects
      // anywhere in the shared library are portable across users and OS.
      const spPath = user.preferences?.sharePointPath ?? ''
      console.log('[WIZARD]   sharePointPath:', spPath || '(not set)')
      const relativeRootPath = spPath ? toLibraryRelativePath(projectRoot, spPath) : undefined
      console.log('[WIZARD]   relativeRootPath:', relativeRootPath ?? '(null — will abort)')

      if (!relativeRootPath) {
        alert('The project folder must be inside your OneDrive library. Please select a folder within your shared OneDrive drive.')
        setCreating(false)
        return
      }

      console.log('[WIZARD]   calling createRecipeProject…')
      const t1 = performance.now()
      const projectId = await createRecipeProject({
        name: data.name.trim(),
        relativeRootPath,
        createdBy: user.uid,
        status: 'active',
        config: {
          customerDefault: data.customerDefault,
          holidayDefault: data.holidayDefault,
          wetPackDefault: data.wetPackDefault,
          wetPackFalseValue: 'N',
          distributionDefault: data.distribution,
          templatePath: data.templatePath,
          sourceMode: data.sourceMode,
          notes: '',
          dueDate: data.dueDate,
        },
      })
      console.log(`[WIZARD]   createRecipeProject done in ${Math.round(performance.now() - t1)} ms — projectId: ${projectId}`)

      let saved = 0
      for (const folder of data.folders) {
        for (const recipe of folder.recipes) {
          const normalizedName = sanitizeWindowsName(normalizeRecipeName(recipe.price, recipe.option, recipe.name))
          if (!normalizedName) continue

          const relativePath = `${sanitizeWindowsName(folder.name)}/${normalizedName}.xlsx`
          const fileId = `${projectId}::${relativePath.replace(/\//g, '|')}`
          const priceKey2 = recipe.price.startsWith('$') ? recipe.price : `$${recipe.price}`
          const hasSleevePrice = !!(sleeveMap[priceKey2] || SLEEVE_PRICE_MAP[priceKey2])
          const detectedHoliday2 = detectHolidayFromName(recipe.name, holidayMap)
          const resolvedHoliday2 = (recipe.holidayOverride && recipe.holidayOverride !== data.holidayDefault)
            ? recipe.holidayOverride
            : (detectedHoliday2 || recipe.holidayOverride || data.holidayDefault || '')
          const outputPath2 = `${projectRoot}/${sanitizeWindowsName(folder.name)}/${normalizedName}.xlsx`
          const storedUid = recipeUidByPath.get(outputPath2) ?? genRecipeUid()

          console.log(`[WIZARD]   upsertRecipeFile [${saved + 1}/${totalFiles}]: ${normalizedName}`)

          const t2 = performance.now()
          await upsertRecipeFile(projectId, fileId, {
            id: fileId,
            projectId,
            fileId,
            recipeUid: storedUid,
            relativePath,
            displayName: normalizedName,
            price: recipe.price,
            option: recipe.option,
            recipeName: recipe.name,
            holidayOverride: resolvedHoliday2,
            customerOverride: recipe.customerOverride,
            wetPackOverride: recipe.wetPackOverride,
            boxTypeOverride: recipe.boxTypeOverride,
            pickNeededOverride: recipe.pickNeededOverride,
            distributionOverride: recipe.distributionOverride,
            status: 'pending',
            lockedBy: null,
            lockClaimedAt: null,
            lockHeartbeatAt: null,
            lockToken: null,
            doneBy: null,
            doneAt: null,
            requiresManualUpdate: !hasSleevePrice,
            version: 0,
            updatedAt: Timestamp.now(),
            assignedTo: null,
            assignedToName: null,
            photoStatus: 'pending',
            capturedPhotos: [],
            readyPngPath: null,
            readyJpgPath: null,
            readyProcessedAt: null,
            readyProcessedBy: null,
            activeNotesCount: 0,
            cleanedPhotoPaths: [],
            cleanedPhotoStatus: null,
            cleanedPhotoDroppedAt: null,
            excelInsertedAt: null,
            excelInsertedBy: null,
          })
          console.log(`[WIZARD]     ✓ saved in ${Math.round(performance.now() - t2)} ms`)

          saved++
          steps = markStep(steps, 'database', 'running', `Saving recipe ${saved} of ${totalFiles}…`)
          setProgress([...steps])
        }
      }

      steps = markStep(steps, 'database', 'done')
      steps = markStep(steps, 'done', 'done', 'Navigating to project…')
      setProgress([...steps])
      console.log('[WIZARD]   STEP 4 done — recipes saved:', saved)

      // Write project.json so any user on any machine can find this project by ID
      console.log('[WIZARD] ── Writing project.json and caching path…')
      window.electronAPI.recipeWriteProjectJson({ folderPath: projectRoot, projectId }).catch(() => {})
      // Cache the absolute path locally so this machine resolves instantly next time
      localStorage.setItem(`npd:project_path_${projectId}`, projectRoot)
      // Seed projectsRoot if not yet configured
      if (!localStorage.getItem('npd:projects_root')) {
        const sep    = projectRoot.includes('\\') ? '\\' : '/'
        const parts  = projectRoot.split(sep).filter(Boolean)
        if (parts.length > 1) {
          const parent = (projectRoot.startsWith('/') ? '/' : '') + parts.slice(0, -1).join(sep)
          localStorage.setItem('npd:projects_root', parent)
          console.log('[WIZARD]   seeded npd:projects_root →', parent)
        }
      }

      console.log('[WIZARD] ── ALL DONE — navigating to /recipes/' + projectId)

      // Brief pause so user sees "done" before navigation
      await new Promise((r) => setTimeout(r, 600))
      navigate(`/recipes/${projectId}`)
    } catch (err) {
      console.error('[WIZARD] ── ERROR ──', err)
      // Mark the currently-running step as error
      steps = steps.map((s) => s.status === 'running' ? { ...s, status: 'error' } : s)
      setProgress([...steps])
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setCreating(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
    <div className="p-6 max-w-xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/recipes')}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back to Projects
      </button>

      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">New NPD Project</h1>

      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {STEP_LABELS.map((label, idx) => {
          const num = idx + 1
          const done = step > num
          const active = step === num
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    done
                      ? 'bg-green-500 text-white'
                      : active
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {done ? <Check size={13} /> : num}
                </div>
                <span
                  className={`text-xs font-medium ${
                    active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx < STEP_LABELS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-3 rounded ${
                    step > num ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content OR progress overlay */}
      {creating ? (
        <CreatingProgress steps={progress} projectName={data.name.trim()} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          {step === 1 && (
            <WizardStepBasics
              data={{
                name: data.name,
                rootPath: data.rootPath,
                templatePath: data.templatePath,
                sourceMode: data.sourceMode,
                dueDate: data.dueDate,
                useProjectNameForSpec: data.useProjectNameForSpec,
                specSheetName: data.specSheetName,
              }}
              onChange={patchData}
              onImportRows={handleImportRows}
            />
          )}
          {step === 2 && (
            <WizardStepRules
              data={{
                customerDefault: data.customerDefault,
                holidayDefault: data.holidayDefault,
                wetPackDefault: data.wetPackDefault,
                distribution: data.distribution,
              }}
              onChange={patchData}
            />
          )}
          {step === 3 && (
            <WizardStepStructure
              folders={data.folders}
              defaults={{
                customerDefault: data.customerDefault,
                holidayDefault: data.holidayDefault,
                wetPackDefault: data.wetPackDefault,
                distributionDefault: data.distribution,
              } satisfies WizardDefaults}
              sourceMode={data.sourceMode}
              holidayMap={holidayMap}
              sleeveMap={sleeveMap}
              onChange={(folders) => patchData({ folders })}
              onValidityChange={() => {
                // Optional: handle validity state
              }}
            />
          )}
          {step === 4 && (
            <WizardStepReview
              name={data.name}
              dueDate={data.dueDate}
              location={data.rootPath ? `${data.rootPath}/${sanitizeWindowsName(data.name.trim())}` : ''}
              defaults={{
                customerDefault: data.customerDefault,
                holidayDefault: data.holidayDefault,
                wetPackDefault: data.wetPackDefault,
                distribution: data.distribution,
              }}
              folders={data.folders}
            />
          )}
        </div>
      )}

      {/* Folder already exists error */}
      {folderExistsError && (
        <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          {folderExistsError}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Footer buttons — hidden while creating */}
      {!creating && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={goBack}
            disabled={step === 1}
            className="rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Back
          </button>

          {step < 4 ? (
            <button
              onClick={goNext}
              disabled={!canGoNext()}
              className="rounded-lg bg-green-500 px-5 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="rounded-lg bg-green-500 px-5 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors"
            >
              Create Project
            </button>
          )}
        </div>
      )}
    </div>
    </AppLayout>
  )
}

// ─────────────────────────────────────────
// Progress overlay component
// ─────────────────────────────────────────

const STEP_ICONS: Record<string, React.ReactNode> = {
  folders:  <FolderPlus size={16} />,
  copy:     <Copy size={16} />,
  excel:    <FileSpreadsheet size={16} />,
  database: <Database size={16} />,
  done:     <CheckCircle2 size={16} />,
}

function CreatingProgress({ steps, projectName }: { steps: ProgressStep[]; projectName: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
        Creating <span className="text-green-500">{projectName}</span>
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">Please wait — do not close the app.</p>

      <div className="space-y-3">
        {steps.map((s) => (
          <div key={s.id} className="flex items-start gap-3">
            {/* Status icon */}
            <div
              className={`mt-0.5 shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                s.status === 'done'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : s.status === 'running'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-500'
                  : s.status === 'error'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-600'
              }`}
            >
              {s.status === 'running' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : s.status === 'done' ? (
                <Check size={14} />
              ) : (
                STEP_ICONS[s.id]
              )}
            </div>

            {/* Label + detail */}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium leading-tight ${
                  s.status === 'done'
                    ? 'text-gray-400 dark:text-gray-500'
                    : s.status === 'running'
                    ? 'text-gray-900 dark:text-white'
                    : s.status === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-300 dark:text-gray-600'
                }`}
              >
                {s.label}
              </p>
              {s.detail && s.status !== 'pending' && (
                <p className={`text-xs mt-0.5 truncate ${
                  s.status === 'error' ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {s.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
