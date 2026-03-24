// src/renderer/src/components/recipes/settings/RecipeSettingsTab.tsx
// Settings panel for the Recipe Manager module

import { useState, useEffect } from 'react'
import { Plus, Trash2, RotateCcw, Save, Loader2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { getRecipeSettings, saveRecipeSettings, initDefaultRecipeSettings } from '../../../lib/recipeFirestore'
import { DistributionEditor } from '../wizard/WizardStepRules'
import { useTaskStore } from '../../../store/taskStore'
import type { RecipeSettings, RecipeRuleCells } from '../../../types'
import {
  DEFAULT_RECIPE_RULE_CELLS,
  RECIPE_HOLIDAY_OPTIONS,
} from '../../../types'

type RecipeSection = 'cells' | 'holidays' | 'sleeve' | 'general'

interface Props {
  userId: string
  section?: RecipeSection
}

const RULE_CELL_LABELS: Array<{ key: keyof RecipeRuleCells; label: string }> = [
  { key: 'recipeName',        label: 'Recipe Name' },
  { key: 'holiday',           label: 'Holiday' },
  { key: 'customer',          label: 'Customer' },
  { key: 'dryPackSuggested',  label: 'Dry Pack Suggested' },
  { key: 'dryPackActual',     label: 'Dry Pack Actual' },
  { key: 'wetPackFlag',       label: 'Wet Pack Flag' },
  { key: 'wetPackSuggested',  label: 'Wet Pack Suggested' },
  { key: 'wetPackActual',     label: 'Wet Pack Actual' },
  { key: 'sleevePrice',       label: 'Sleeve Price' },
  { key: 'sleeveFlag',        label: 'Sleeve Flag' },
  { key: 'stemCount',         label: 'Stem Count' },
  { key: 'pickNeeded',        label: 'Pick Needed' },
  { key: 'boxType',           label: 'Box Type' },
]

export default function RecipeSettingsTab({ userId, section }: Props) {
  const show = (s: RecipeSection) => !section || section === s
  const setToast = useTaskStore((s) => s.setToast)
  const [settings, setSettings] = useState<RecipeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Load on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    getRecipeSettings(userId).then(async (s) => {
      if (s) {
        setSettings(s)
      } else {
        const defaults = await initDefaultRecipeSettings(userId)
        setSettings(defaults)
      }
      setLoading(false)
    }).catch((err) => {
      console.error('RecipeSettingsTab load error:', err)
      setLoading(false)
    })
  }, [userId])

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!settings) return
    setSaving(true)
    try {
      await saveRecipeSettings(userId, settings)
      setToast({ id: nanoid(), message: 'Recipe settings saved', type: 'success' })
    } catch (err) {
      setToast({ id: nanoid(), message: 'Failed to save settings', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function update(patch: Partial<RecipeSettings>) {
    setSettings((prev) => prev ? { ...prev, ...patch } : prev)
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 py-12 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading recipe settings…</span>
      </div>
    )
  }

  return (
    <div className="space-y-10 max-w-2xl">

      {/* ── Rule Cells ────────────────────────────────────────────────────── */}
      {show('cells') && <Section
        title="Rule Cells"
        description="Excel cell addresses used during validation. Change these if your template layout differs."
        action={
          <button
            onClick={() => update({ ruleCells: { ...DEFAULT_RECIPE_RULE_CELLS } })}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <RotateCcw size={12} />
            Restore Defaults
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          {RULE_CELL_LABELS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</label>
              <input
                type="text"
                value={settings.ruleCells[key]}
                onChange={(e) =>
                  update({ ruleCells: { ...settings.ruleCells, [key]: e.target.value.toUpperCase() } })
                }
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
                placeholder="A1"
              />
            </div>
          ))}
        </div>
      </Section>}

      {/* ── Holiday Dictionary ────────────────────────────────────────────── */}
      {show('holidays') && <Section
        title="Holiday Dictionary"
        description="Maps keywords in recipe names to holiday values written to the Holiday cell."
        action={
          <button
            onClick={() => {
              const newMap = { ...settings.holidayMap, '': '' }
              update({ holidayMap: newMap })
            }}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            <Plus size={12} />
            Add Keyword
          </button>
        }
      >
        <div className="space-y-2">
          {Object.entries(settings.holidayMap).map(([keyword, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={keyword}
                placeholder="Keyword (e.g. VALENTINE)"
                onChange={(e) => {
                  const entries = Object.entries(settings.holidayMap)
                  entries[i] = [e.target.value.toUpperCase(), value]
                  update({ holidayMap: Object.fromEntries(entries) })
                }}
                className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
              />
              <span className="text-gray-400 text-xs">→</span>
              <select
                value={value}
                onChange={(e) => {
                  const entries = Object.entries(settings.holidayMap)
                  entries[i] = [keyword, e.target.value]
                  update({ holidayMap: Object.fromEntries(entries) })
                }}
                className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
              >
                <option value="">— Select —</option>
                {RECIPE_HOLIDAY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const entries = Object.entries(settings.holidayMap).filter((_, j) => j !== i)
                  update({ holidayMap: Object.fromEntries(entries) })
                }}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {Object.keys(settings.holidayMap).length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No keywords defined.</p>
          )}
        </div>
      </Section>}

      {/* ── Sleeve by Price ───────────────────────────────────────────────── */}
      {show('sleeve') && <Section
        title="Sleeve by Price"
        description='Maps recipe price strings (e.g. "$12.99") to sleeve price values.'
        action={
          <button
            onClick={() => update({ sleeveByPrice: { ...settings.sleeveByPrice, '': '' } })}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            <Plus size={12} />
            Add
          </button>
        }
      >
        <PriceTable
          data={settings.sleeveByPrice}
          keyPlaceholder='Price (e.g. "$12.99")'
          onChange={(data) => update({ sleeveByPrice: data })}
        />
      </Section>}

      {/* ── Sleeve by Stem Count ──────────────────────────────────────────── */}
      {show('sleeve') && <Section
        title="Sleeve by Stem Count"
        description="Maps stem count values (from cell K3) to sleeve price values."
        action={
          <button
            onClick={() => update({ sleeveByStems: { ...settings.sleeveByStems, '': '' } })}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            <Plus size={12} />
            Add
          </button>
        }
      >
        <PriceTable
          data={settings.sleeveByStems}
          keyPlaceholder="Stem count (e.g. 12)"
          onChange={(data) => update({ sleeveByStems: data })}
        />
      </Section>}

      {/* ── General ──────────────────────────────────────────────────────── */}
      {show('general') && <Section
        title="General"
        description="Lock timeout and default distribution percentages."
      >
        <div className="space-y-5">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Lock Timeout
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={120}
                max={3600}
                step={30}
                value={settings.lockTimeoutSeconds}
                onChange={(e) => {
                  const v = Math.max(120, Math.min(3600, parseInt(e.target.value) || 300))
                  update({ lockTimeoutSeconds: v })
                }}
                className="w-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
              />
              <span className="text-xs text-gray-400 dark:text-gray-500">seconds (min 120, max 3600)</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">
              Default Distribution
            </label>
            <DistributionEditor
              value={settings.distributionDefaults}
              onChange={(dist) => update({ distributionDefaults: dist })}
            />
          </div>
        </div>
      </Section>}

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-green-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function PriceTable({
  data,
  keyPlaceholder,
  onChange,
}: {
  data: Record<string, string>
  keyPlaceholder: string
  onChange: (data: Record<string, string>) => void
}) {
  const entries = Object.entries(data)

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 italic">No entries defined.</p>
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, value], i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={key}
            placeholder={keyPlaceholder}
            onChange={(e) => {
              const next = [...entries]
              next[i] = [e.target.value, value]
              onChange(Object.fromEntries(next))
            }}
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
          />
          <span className="text-gray-400 text-xs">→</span>
          <input
            type="text"
            value={value}
            placeholder="Sleeve price"
            onChange={(e) => {
              const next = [...entries]
              next[i] = [key, e.target.value]
              onChange(Object.fromEntries(next))
            }}
            className="w-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
          />
          <button
            onClick={() => {
              const next = entries.filter((_, j) => j !== i)
              onChange(Object.fromEntries(next))
            }}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
