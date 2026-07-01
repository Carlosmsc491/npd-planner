// src/renderer/src/components/recipes/wizard/WizardStepReview.tsx
// Step 4: read-only summary of everything the wizard will create.

import { Folder, FileSpreadsheet, Calendar, MapPin, Package } from 'lucide-react'
import { normalizeRecipeName } from '../../../utils/recipeNaming'
import type { RecipeDistribution } from '../../../types'
import { DISTRIBUTION_CELLS } from '../../../types'
import type { WizardFolder } from './WizardStepStructure'

interface ReviewDefaults {
  customerDefault: string
  holidayDefault: string
  wetPackDefault: boolean
  distribution: RecipeDistribution
}

interface Props {
  name: string
  dueDate: string | null
  location: string
  defaults: ReviewDefaults
  folders: WizardFolder[]
}

const DC_LABELS: Record<keyof RecipeDistribution, string> = {
  miami: 'Miami', newJersey: 'New Jersey', california: 'California',
  chicago: 'Chicago', seattle: 'Seattle', texas: 'Texas',
}

function distText(d: RecipeDistribution): string {
  const parts = (Object.keys(DISTRIBUTION_CELLS) as (keyof RecipeDistribution)[])
    .filter((k) => (d[k] ?? 0) > 0)
    .map((k) => `${DC_LABELS[k]} ${d[k]}%`)
  return parts.length ? parts.join(' · ') : 'none set'
}

/** Overrides on a recipe vs the project defaults (what differs). */
function recipeOverrides(
  recipe: WizardFolder['recipes'][number],
  d: ReviewDefaults,
): string[] {
  const out: string[] = []
  if (recipe.customerOverride && recipe.customerOverride !== d.customerDefault) out.push(`Customer: ${recipe.customerOverride}`)
  if (recipe.holidayOverride && recipe.holidayOverride !== d.holidayDefault) out.push(`Holiday: ${recipe.holidayOverride}`)
  const defWet = d.wetPackDefault ? 'Y' : 'N'
  if (recipe.wetPackOverride && recipe.wetPackOverride !== defWet) out.push(`Wet Pack: ${recipe.wetPackOverride === 'Y' ? 'Yes' : 'No'}`)
  if (recipe.pickNeededOverride === 'Y') out.push('Pick Needed: Yes')
  if (JSON.stringify(recipe.distributionOverride) !== JSON.stringify(d.distribution)) out.push(`Distribution: ${distText(recipe.distributionOverride)}`)
  return out
}

export default function WizardStepReview({ name, dueDate, location, defaults, folders }: Props) {
  const totalRecipes = folders.reduce((n, f) => n + f.recipes.length, 0)

  return (
    <div className="space-y-5">
      {/* Project summary */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard icon={<FileSpreadsheet size={14} />} label="Project">{name || <em className="text-gray-400">Unnamed</em>}</SummaryCard>
        <SummaryCard icon={<Calendar size={14} />} label="Deadline">{dueDate || <span className="text-gray-400">No deadline</span>}</SummaryCard>
        <SummaryCard icon={<MapPin size={14} />} label="Location" className="col-span-2">
          <span className="font-mono text-xs break-all">{location || <span className="text-gray-400">—</span>}</span>
        </SummaryCard>
      </div>

      {/* Default rules */}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Default Rules</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <RuleRow label="Customer" value={defaults.customerDefault} />
          <RuleRow label="Holiday" value={defaults.holidayDefault} />
          <RuleRow label="Wet Pack" value={defaults.wetPackDefault ? 'Yes' : 'No'} />
          <RuleRow label="Distribution" value={distText(defaults.distribution)} />
        </div>
      </div>

      {/* Structure tree */}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Structure — {folders.length} folder{folders.length !== 1 ? 's' : ''}, {totalRecipes} recipe{totalRecipes !== 1 ? 's' : ''}
        </h4>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
          {folders.length === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-400 italic">No folders / recipes.</p>
          ) : (
            folders.map((folder) => (
              <div key={folder.id} className="py-1.5">
                <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
                  <Folder size={12} className="text-amber-500" /> {folder.name}
                  <span className="text-[10px] font-normal text-gray-400">({folder.recipes.length})</span>
                </div>
                {folder.recipes.map((recipe) => {
                  const overrides = recipeOverrides(recipe, defaults)
                  return (
                    <div key={recipe.id} className="pl-8 pr-3 py-1">
                      <div className="flex items-center gap-1.5">
                        <FileSpreadsheet size={11} className="text-gray-400 shrink-0" />
                        <span className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate">
                          {normalizeRecipeName(recipe.price, recipe.option, recipe.name) || <em className="text-gray-400">unnamed</em>}.xlsx
                        </span>
                        {overrides.length > 0 && (
                          <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 dark:text-blue-400">
                            <Package size={8} />{overrides.length} override{overrides.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {overrides.length > 0 && (
                        <p className="pl-5 text-[10px] text-blue-600 dark:text-blue-400 leading-snug">{overrides.join(' · ')}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, children, className = '' }: { icon: React.ReactNode; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-3 py-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-0.5">{icon}{label}</div>
      <div className="text-sm text-gray-900 dark:text-white">{children}</div>
    </div>
  )
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-gray-100 dark:border-gray-800 px-2.5 py-1.5">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-800 dark:text-gray-200 text-right truncate ml-2">{value}</span>
    </div>
  )
}
