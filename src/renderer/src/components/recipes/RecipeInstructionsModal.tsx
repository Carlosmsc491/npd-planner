// RecipeInstructionsModal.tsx — Step-by-step guide for working in a Recipe Project
// Shows automatically on first visit to a project. Can be reopened via the toolbar.
//
// localStorage keys:
//   npd:recipe_instr_forever   → "1"  — user never wants to see it again (any project)
//   npd:recipe_instr_seen_{id} → "1"  — user dismissed it for this specific project

import { useState } from 'react'
import {
  X, MousePointerClick, FileSpreadsheet, CheckSquare, Camera,
  MessageSquare, Lock, BookOpen, ChevronRight,
} from 'lucide-react'

const LS_FOREVER = 'npd:recipe_instr_forever'
const lsProjectKey = (id: string) => `npd:recipe_instr_seen_${id}`

export function shouldShowInstructions(projectId: string): boolean {
  try {
    if (localStorage.getItem(LS_FOREVER) === '1') return false
    if (localStorage.getItem(lsProjectKey(projectId)) === '1') return false
    return true
  } catch {
    return false
  }
}

interface Step {
  icon: React.ElementType
  color: string
  title: string
  detail: string
}

const STEPS: Step[] = [
  {
    icon: MousePointerClick,
    color: '#1D9E75',
    title: 'Browse & Select a Recipe',
    detail:
      'Click any recipe card in the grid to open its detail panel on the right. ' +
      'You can see its current status, who has it claimed, and any open notes.',
  },
  {
    icon: Lock,
    color: '#378ADD',
    title: 'Claim the Recipe',
    detail:
      'Click "Claim Recipe" to lock the file for yourself. ' +
      'This prevents two people from editing the same Excel at the same time. ' +
      'Only one person can hold a recipe at a time.',
  },
  {
    icon: FileSpreadsheet,
    color: '#217346',
    title: 'Open & Fill in Excel',
    detail:
      'After claiming, click "Open in Excel" to edit the spec sheet. ' +
      'Fill in all required fields: product details, pricing, distribution percentages, ' +
      'wet pack, and any other required data for the recipe.',
  },
  {
    icon: Camera,
    color: '#F59E0B',
    title: 'Photography (if required)',
    detail:
      'If the recipe needs product photos, click "Take Photos" to start a camera session. ' +
      'Captured photos are automatically organized by project and recipe name. ' +
      'Photo status is shown on each card (green = pending, amber = in progress).',
  },
  {
    icon: MessageSquare,
    color: '#EF4444',
    title: 'Check & Post Notes',
    detail:
      'Always read the Notes section before starting. Team members may have left ' +
      'important instructions or flags. Post your own notes to communicate with the team ' +
      'while the recipe is in progress.',
  },
  {
    icon: CheckSquare,
    color: '#1D9E75',
    title: 'Mark as Done',
    detail:
      'When your edits are complete and saved in Excel, return to NPD Planner ' +
      'and click "Mark as Done". This releases the lock and signals the recipe is ready ' +
      'for review. The card will turn green in the grid.',
  },
]

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
}

export default function RecipeInstructionsModal({ projectId, projectName, onClose }: Props) {
  const [neverShow, setNeverShow] = useState(false)

  function handleClose() {
    try {
      if (neverShow) {
        localStorage.setItem(LS_FOREVER, '1')
      } else {
        localStorage.setItem(lsProjectKey(projectId), '1')
      }
    } catch { /* ignore */ }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shrink-0">
            <BookOpen size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
              How to Work in a Recipe Project
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
              {projectName}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="ml-auto shrink-0 h-7 w-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={i} className="flex gap-3 items-start">
                {/* Step number + icon */}
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-[10px] font-bold"
                    style={{ backgroundColor: step.color }}
                  >
                    <Icon size={15} />
                  </div>
                  {i < STEPS.length - 1 && (
                    <ChevronRight size={12} className="text-gray-300 dark:text-gray-700 rotate-90" />
                  )}
                </div>
                {/* Text */}
                <div className="pb-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {step.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
          {/* Don't show again */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setNeverShow(v => !v)}
              className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                neverShow
                  ? 'bg-green-500 border-green-500'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
              }`}
            >
              {neverShow && (
                <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-white" fill="none">
                  <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Don't show this again for any project
            </span>
          </label>

          <button
            onClick={handleClose}
            className="shrink-0 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow hover:from-green-700 hover:to-emerald-700 transition-all"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}
