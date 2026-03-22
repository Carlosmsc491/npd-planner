// src/renderer/src/components/recipes/wizard/WizardStepRules.tsx
// Step 2: Business rules — customer, holiday, wet pack, distribution

import type { RecipeDistribution } from '../../../types'
import { RECIPE_CUSTOMER_OPTIONS, RECIPE_HOLIDAY_OPTIONS } from '../../../types'

interface RulesData {
  customerDefault: string
  holidayDefault: string
  wetPackDefault: boolean
  distribution: RecipeDistribution
}

interface Props {
  data: RulesData
  onChange: (updates: Partial<RulesData>) => void
}

export default function WizardStepRules({ data, onChange }: Props) {
  return (
    <div className="space-y-5">
      {/* Customer default */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Default Customer
        </label>
        <select
          value={data.customerDefault}
          onChange={(e) => onChange({ customerDefault: e.target.value })}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
        >
          {RECIPE_CUSTOMER_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Holiday default */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Default Holiday
        </label>
        <select
          value={data.holidayDefault}
          onChange={(e) => onChange({ holidayDefault: e.target.value })}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
        >
          {RECIPE_HOLIDAY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Wet Pack toggle */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          Wet Pack Required
        </label>
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((val) => (
            <button
              key={String(val)}
              onClick={() => onChange({ wetPackDefault: val })}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                data.wetPackDefault === val
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              {val ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </div>

      {/* Distribution */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          Default Distribution (%)
        </label>
        <DistributionEditor
          value={data.distribution}
          onChange={(dist) => onChange({ distribution: dist })}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// DistributionEditor — reusable component
// ─────────────────────────────────────────

const DC_LABELS: [keyof RecipeDistribution, string][] = [
  ['miami',      'Miami'],
  ['newJersey',  'New Jersey'],
  ['california', 'California'],
  ['chicago',    'Chicago'],
  ['seattle',    'Seattle'],
  ['texas',      'Texas'],
]

interface DistributionEditorProps {
  value: RecipeDistribution
  onChange: (value: RecipeDistribution) => void
}

export function DistributionEditor({ value, onChange }: DistributionEditorProps) {
  const total = Object.values(value).reduce((a, b) => a + b, 0)
  const isOver = total > 100

  function handleChange(key: keyof RecipeDistribution, raw: string) {
    const num = Math.max(0, Math.min(100, parseInt(raw || '0', 10) || 0))
    const next = { ...value, [key]: num }

    // Miami override: if Miami = 100, zero out all other DCs
    if (key === 'miami' && num === 100) {
      onChange({
        miami:      100,
        newJersey:  0,
        california: 0,
        chicago:    0,
        seattle:    0,
        texas:      0,
      })
      return
    }

    // If a non-Miami DC is changed while Miami is 100, reset Miami first
    if (key !== 'miami' && value.miami === 100) {
      next.miami = 0
    }

    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {DC_LABELS.map(([key, label]) => {
          const isMiamiLocked = key !== 'miami' && value.miami === 100
          return (
            <div key={key} className="flex items-center gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-400 w-24 shrink-0">{label}</label>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={value[key]}
                disabled={isMiamiLocked}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-center text-gray-900 dark:text-white focus:outline-none focus:border-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium ${
        isOver
          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
          : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
      }`}>
        <span>Total</span>
        <span className={isOver ? 'text-red-600 dark:text-red-400' : ''}>
          {total}% {isOver && '— exceeds 100%'}
        </span>
      </div>
    </div>
  )
}
