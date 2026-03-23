// src/renderer/src/components/recipes/wizard/NewRecipeProjectWizard.tsx
// 3-step wizard: Basics → Rules → Structure → Create Project

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Check } from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import { createRecipeProject, upsertRecipeFile } from '../../../lib/recipeFirestore'
import { normalizeRecipeName } from '../../../utils/recipeNaming'
import {
  RECIPE_CUSTOMER_OPTIONS,
  RECIPE_HOLIDAY_OPTIONS,
  DEFAULT_RECIPE_DISTRIBUTION,
} from '../../../types'
import type { RecipeDistribution } from '../../../types'
import WizardStepBasics from './WizardStepBasics'
import WizardStepRules from './WizardStepRules'
import WizardStepStructure from './WizardStepStructure'
import type { WizardFolder, WizardDefaults } from './WizardStepStructure'
import AppLayout from '../../ui/AppLayout'

// ─────────────────────────────────────────
// Wizard data shape
// ─────────────────────────────────────────

interface WizardData {
  // Step 1
  name: string
  rootPath: string
  templatePath: string
  sourceMode: 'from_scratch' | 'import'
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

  const [data, setData] = useState<WizardData>({
    name: '',
    rootPath: '',
    templatePath: '',
    sourceMode: 'from_scratch',
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

  async function handleCreate() {
    if (!user) return
    setCreating(true)
    setError(null)

    try {
      const projectRoot = `${data.rootPath}/${data.name.trim()}`

      // 1. Create root folder on filesystem
      await window.electronAPI.recipeCreateFolder(projectRoot)
      // Create _project metadata folder
      await window.electronAPI.recipeCreateFolder(`${projectRoot}/_project`)

      // 2. Create each folder and generate Excel files from template
      for (const folder of data.folders) {
        const folderPath = `${projectRoot}/${folder.name}`
        await window.electronAPI.recipeCreateFolder(folderPath)

        for (const recipe of folder.recipes) {
          const normalizedName = normalizeRecipeName(recipe.price, recipe.option, recipe.name)
          if (!normalizedName) continue

          const outputPath = `${folderPath}/${normalizedName}.xlsx`

          const recipeSpec = {
            recipeId: recipe.id,
            relativePath: `${folder.name}/${normalizedName}.xlsx`,
            displayName: normalizedName,
            price: recipe.price,
            option: recipe.option,
            name: recipe.name,
            holidayOverride: recipe.holidayOverride,
            customerOverride: recipe.customerOverride,
            wetPackOverride: recipe.wetPackOverride,
            distributionOverride: recipe.distributionOverride,
            requiresManualUpdate: false,
          }

          await window.electronAPI.recipeGenerateFromTemplate(
            data.templatePath,
            outputPath,
            recipeSpec
          )
        }
      }

      // 3. Create Firestore project document
      const projectId = await createRecipeProject({
        name: data.name.trim(),
        rootPath: projectRoot,
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
        },
      })

      // 4. Create Firestore recipeFile documents
      for (const folder of data.folders) {
        for (const recipe of folder.recipes) {
          const normalizedName = normalizeRecipeName(recipe.price, recipe.option, recipe.name)
          if (!normalizedName) continue

          const relativePath = `${folder.name}/${normalizedName}.xlsx`
          const fileId = `${projectId}::${relativePath}`

          await upsertRecipeFile(projectId, fileId, {
            id: fileId,
            projectId,
            fileId,
            relativePath,
            displayName: normalizedName,
            price: recipe.price,
            option: recipe.option,
            recipeName: recipe.name,
            holidayOverride: recipe.holidayOverride,
            customerOverride: recipe.customerOverride,
            wetPackOverride: recipe.wetPackOverride,
            distributionOverride: recipe.distributionOverride,
            status: 'pending',
            lockedBy: null,
            lockClaimedAt: null,
            lockHeartbeatAt: null,
            lockToken: null,
            doneBy: null,
            doneAt: null,
            requiresManualUpdate: false,
            version: 0,
            updatedAt: null as unknown as import('firebase/firestore').Timestamp,
          })
        }
      }

      // 5. Navigate to the new project
      navigate(`/recipes/${projectId}`)
    } catch (err) {
      console.error('Create project error:', err)
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

      {/* Step content */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        {step === 1 && (
          <WizardStepBasics
            data={{
              name: data.name,
              rootPath: data.rootPath,
              templatePath: data.templatePath,
              sourceMode: data.sourceMode,
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
            onChange={(folders) => patchData({ folders })}
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Footer buttons */}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={goBack}
          disabled={step === 1 || creating}
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
            disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-green-500 px-5 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            {creating ? 'Creating…' : 'Create Project'}
          </button>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
