// src/renderer/src/components/recipes/wizard/NewRecipeProjectWizard.tsx
// 3-step wizard: Basics → Rules → Structure → Create Project

import React, { useState } from 'react'
import { nanoid } from 'nanoid'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Check, FolderPlus, Copy, FileSpreadsheet, Database, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import { createRecipeProject, upsertRecipeFile } from '../../../lib/recipeFirestore'
import { normalizeRecipeName, sanitizeWindowsName } from '../../../utils/recipeNaming'
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
import type { WizardFolder, WizardDefaults } from './WizardStepStructure'
import AppLayout from '../../ui/AppLayout'

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
  // Step 2
  customerDefault: string
  holidayDefault: string
  wetPackDefault: boolean
  distribution: RecipeDistribution
  // Step 3
  folders: WizardFolder[]
}

const STEP_LABELS = ['Basics', 'Rules', 'Structure']

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

  const [data, setData] = useState<WizardData>({
    name: '',
    rootPath: '',
    templatePath: '',
    sourceMode: 'from_scratch',
    dueDate: null,
    customerDefault: RECIPE_CUSTOMER_OPTIONS[0],
    holidayDefault: RECIPE_HOLIDAY_OPTIONS[0],
    wetPackDefault: false,
    distribution: { ...DEFAULT_RECIPE_DISTRIBUTION },
    folders: [],
  })

  function patchData(updates: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...updates }))
  }

  // ── Validation ──────────────────────────────────────────────────────────

  function isStep1Valid(): boolean {
    return data.name.trim().length > 0 && data.rootPath.length > 0 && data.templatePath.length > 0
  }

  function isStep2Valid(): boolean {
    const total = Object.values(data.distribution).reduce((a, b) => a + b, 0)
    return total <= 100
  }

  function canGoNext(): boolean {
    if (step === 1) return isStep1Valid()
    if (step === 2) return isStep2Valid()
    return true
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  function goNext() {
    if (step < 3) setStep(step + 1)
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

    const totalFiles = data.folders.reduce((n, f) => n + f.recipes.length, 0)
    let steps = initProgress(totalFiles)
    setProgress(steps)
    setCreating(true)

    try {
      const projectRoot = `${data.rootPath}/${sanitizeWindowsName(data.name.trim())}`

      // ── Step 1: Create folders ─────────────────────────────────────────────
      steps = markStep(steps, 'folders', 'running', 'Creating project directory…')
      setProgress([...steps])

      await window.electronAPI.recipeCreateFolder(projectRoot)
      await window.electronAPI.recipeCreateFolder(`${projectRoot}/_project`)
      for (const folder of data.folders) {
        await window.electronAPI.recipeCreateFolder(`${projectRoot}/${sanitizeWindowsName(folder.name)}`)
      }

      steps = markStep(steps, 'folders', 'done')
      setProgress([...steps])

      // ── Step 2: Copy template files ────────────────────────────────────────
      steps = markStep(steps, 'copy', 'running')
      setProgress([...steps])

      const batchUpdates: Array<{ filePath: string; updates: Array<{ sheet: string; cell: string; value: string }> }> = []
      // Map outputPath → recipeUid so we can persist it to Firestore in step 4
      const recipeUidByPath = new Map<string, string>()
      let copied = 0

      for (const folder of data.folders) {
        const safeFolderName = sanitizeWindowsName(folder.name)
        const folderPath = `${projectRoot}/${safeFolderName}`
        for (const recipe of folder.recipes) {
          const normalizedName = sanitizeWindowsName(normalizeRecipeName(recipe.price, recipe.option, recipe.name))
          if (!normalizedName) continue

          const outputPath = `${folderPath}/${normalizedName}.xlsx`
          const priceKey = recipe.price.startsWith('$') ? recipe.price : `$${recipe.price}`
          const sleevePrice = SLEEVE_PRICE_MAP[priceKey] ?? ''
          const requiresManualUpdate = !sleevePrice

          const recipeSpec = {
            recipeId: recipe.id,
            relativePath: `${safeFolderName}/${normalizedName}.xlsx`,
            projectName: data.name.trim(),
            displayName: normalizedName,
            price: recipe.price,
            option: recipe.option,
            name: recipe.name,
            holidayOverride: recipe.holidayOverride,
            customerOverride: recipe.customerOverride,
            wetPackOverride: recipe.wetPackOverride,
            boxTypeOverride: recipe.boxTypeOverride,
            pickNeededOverride: recipe.pickNeededOverride,
            distributionOverride: recipe.distributionOverride,
            requiresManualUpdate,
          }

          await window.electronAPI.recipeGenerateFromTemplate(data.templatePath, outputPath, recipeSpec)
          copied++

          steps = markStep(steps, 'copy', 'running', `Copying file ${copied} of ${totalFiles}… ${normalizedName}`)
          setProgress([...steps])

          // Distribution cells: written as ratios (divide by 100)
          const distUpdates = (Object.entries(DISTRIBUTION_CELLS) as [keyof RecipeDistribution, string][])
            .map(([key, cell]) => ({
              sheet: 'Quote',
              cell,
              value: String((recipe.distributionOverride[key] ?? 0) / 100),
            }))

          const recipeUid = nanoid()
          recipeUidByPath.set(outputPath, recipeUid)

          batchUpdates.push({
            filePath: outputPath,
            updates: [
              { sheet: 'Quote',      cell: 'D3',   value: normalizedName },
              { sheet: 'Quote',      cell: 'Z52',  value: recipeUid },
              { sheet: 'Quote',      cell: 'D6',   value: recipe.holidayOverride    || '' },
              { sheet: 'Quote',      cell: 'D7',   value: recipe.customerOverride   || '' },
              { sheet: 'Quote',      cell: 'AA40', value: recipe.wetPackOverride    || '' },
              { sheet: 'Quote',      cell: 'Z6',   value: recipe.boxTypeOverride    || '' },
              { sheet: 'Quote',      cell: 'AC23', value: recipe.pickNeededOverride || '' },
              { sheet: 'Quote',      cell: 'AB25', value: sleevePrice },
              { sheet: 'Quote',      cell: 'AC25', value: sleevePrice ? 'Y' : '' },
              { sheet: 'Spec Sheet', cell: 'E4',   value: data.name.trim() },
              ...distUpdates,
            ],
          })
        }
      }

      steps = markStep(steps, 'copy', 'done')
      setProgress([...steps])

      // ── Step 3: Write Excel cells via COM (one session) ────────────────────
      if (batchUpdates.length > 0) {
        steps = markStep(steps, 'excel', 'running', 'Opening Excel — this may take a moment…')
        setProgress([...steps])

        await window.electronAPI.recipeBatchWriteCells(batchUpdates)

        steps = markStep(steps, 'excel', 'done')
        setProgress([...steps])
      } else {
        steps = markStep(steps, 'excel', 'done')
        setProgress([...steps])
      }

      // ── Step 4: Save to Firestore ──────────────────────────────────────────
      steps = markStep(steps, 'database', 'running', 'Creating project record…')
      setProgress([...steps])

      // Compute portable relative path from the creator's SharePoint root
      const spPath    = user.preferences?.sharePointPath ?? ''
      const normalSP  = spPath.replace(/\\/g, '/').replace(/\/$/, '')
      const normalRoot = projectRoot.replace(/\\/g, '/')
      const relativeRootPath = normalSP && normalRoot.startsWith(normalSP + '/')
        ? normalRoot.slice(normalSP.length + 1)
        : undefined

      const projectId = await createRecipeProject({
        name: data.name.trim(),
        rootPath: projectRoot,
        ...(relativeRootPath !== undefined ? { relativeRootPath } : {}),
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

      let saved = 0
      for (const folder of data.folders) {
        for (const recipe of folder.recipes) {
          const normalizedName = sanitizeWindowsName(normalizeRecipeName(recipe.price, recipe.option, recipe.name))
          if (!normalizedName) continue

          const relativePath = `${sanitizeWindowsName(folder.name)}/${normalizedName}.xlsx`
          const fileId = `${projectId}::${relativePath.replace(/\//g, '|')}`
          const priceKey2 = recipe.price.startsWith('$') ? recipe.price : `$${recipe.price}`
          const hasSleevePrice = !!SLEEVE_PRICE_MAP[priceKey2]
          const outputPath2 = `${projectRoot}/${sanitizeWindowsName(folder.name)}/${normalizedName}.xlsx`
          const storedUid = recipeUidByPath.get(outputPath2) ?? nanoid()

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
            holidayOverride: recipe.holidayOverride,
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

          saved++
          steps = markStep(steps, 'database', 'running', `Saving recipe ${saved} of ${totalFiles}…`)
          setProgress([...steps])
        }
      }

      steps = markStep(steps, 'database', 'done')
      steps = markStep(steps, 'done', 'done', 'Navigating to project…')
      setProgress([...steps])

      // Brief pause so user sees "done" before navigation
      await new Promise((r) => setTimeout(r, 600))
      navigate(`/recipes/${projectId}`)
    } catch (err) {
      console.error('Create project error:', err)
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
              }}
              onChange={patchData}
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
              onChange={(folders) => patchData({ folders })}
              onValidityChange={() => {
                // Optional: handle validity state
              }}
            />
          )}
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

          {step < 3 ? (
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
