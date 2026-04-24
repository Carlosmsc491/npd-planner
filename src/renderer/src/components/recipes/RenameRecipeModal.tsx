// RenameRecipeModal.tsx — Step-by-step modal for renaming a recipe and all its photos

import { useState, useRef, useEffect } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Pencil, X } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import type { RecipeFile, RecipeProject, RenameWithPhotosResult, CapturedPhoto } from '../../types'

interface Props {
  file: RecipeFile
  project: RecipeProject
  ssdBase: string | null
  onClose: () => void
  onSuccess: (result: RenameWithPhotosResult, newDisplayName: string) => void
}

type Step =
  | { id: 'rename-excel';  label: string }
  | { id: 'update-cells';  label: string }
  | { id: 'rename-photos'; label: string }
  | { id: 'done';          label: string }

type StepState = 'pending' | 'running' | 'done' | 'error'

export default function RenameRecipeModal({ file, project, ssdBase, onClose, onSuccess }: Props) {
  const [inputValue, setInputValue] = useState(file.displayName)
  const [phase, setPhase]           = useState<'input' | 'working' | 'errors' | 'done'>('input')
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({})
  const [nonFatalErrors, setNonFatalErrors] = useState<string[]>([])
  const [fatalError, setFatalError]         = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (phase === 'input') inputRef.current?.focus()
  }, [phase])

  const steps: Step[] = [
    { id: 'rename-excel',  label: 'Renaming Excel file' },
    { id: 'update-cells',  label: 'Updating recipe name in Excel' },
    { id: 'rename-photos', label: `Renaming ${file.capturedPhotos.length} photo${file.capturedPhotos.length !== 1 ? 's' : ''}` },
    { id: 'done',          label: 'Saving to database' },
  ]

  function setStep(id: string, state: StepState) {
    setStepStates(prev => ({ ...prev, [id]: state }))
  }

  async function handleConfirm() {
    const newDisplayName = inputValue.trim()
    if (!newDisplayName || newDisplayName === file.displayName) return

    setPhase('working')
    setStepStates({ 'rename-excel': 'running', 'update-cells': 'pending', 'rename-photos': 'pending', 'done': 'pending' })

    // Build full Excel path
    const excelPath = `${project.rootPath.replace(/\\/g, '/')}/${file.relativePath.replace(/\\/g, '/')}`

    try {
      const result = await window.electronAPI.recipeRenameWithPhotos({
        excelPath,
        newBaseName:    newDisplayName,
        newDisplayName,
        capturedPhotos: file.capturedPhotos as unknown as CapturedPhoto[],
        readyPngPath:   file.readyPngPath,
        readyJpgPath:   file.readyJpgPath,
        projectRoot:    project.rootPath,
        ssdBase,
        projectName:    project.name,
      })

      if (!result.success) {
        setStep('rename-excel', 'error')
        setFatalError(result.errors[0] ?? 'Unknown error')
        setPhase('errors')
        return
      }

      setStep('rename-excel',  'done')
      setStep('update-cells',  'done')
      setStep('rename-photos', 'running')

      // Short visual delay so the user sees each step
      await new Promise(r => setTimeout(r, 300))
      setStep('rename-photos', 'done')
      setStep('done', 'running')

      if (result.errors.length > 0) {
        setNonFatalErrors(result.errors)
      }

      // Reconstruct Timestamp fields that were stripped by IPC serialization
      const rehydratedPhotos: CapturedPhoto[] = result.updatedPhotos.map(p => ({
        ...p,
        capturedAt: p.capturedAt instanceof Timestamp
          ? p.capturedAt
          : new Timestamp((p.capturedAt as { seconds: number }).seconds, (p.capturedAt as { nanoseconds: number }).nanoseconds),
        selectedAt: p.selectedAt
          ? (p.selectedAt instanceof Timestamp
              ? p.selectedAt
              : new Timestamp((p.selectedAt as { seconds: number }).seconds, (p.selectedAt as { nanoseconds: number }).nanoseconds))
          : undefined,
      }))

      const rehydratedResult: RenameWithPhotosResult = {
        ...result,
        updatedPhotos: rehydratedPhotos,
      }

      setStep('done', 'done')

      if (result.errors.length > 0) {
        setPhase('errors')
      } else {
        setPhase('done')
      }

      onSuccess(rehydratedResult, newDisplayName)
    } catch (err) {
      setFatalError(String(err))
      setPhase('errors')
    }
  }

  const isWorking = phase === 'working'
  const trimmed   = inputValue.trim()
  const canSubmit = trimmed.length > 0 && trimmed !== file.displayName && !isWorking

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-gray-500 dark:text-gray-400" />
            <span className="font-semibold text-gray-900 dark:text-white text-sm">Rename Recipe</span>
          </div>
          {!isWorking && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Input phase */}
          {(phase === 'input' || phase === 'working') && (
            <>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  This will rename the Excel file, update cell D3, and rename all associated photos
                  in <span className="font-medium text-gray-700 dark:text-gray-200">CAMERA</span>,{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-200">SELECTED</span>, and{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-200">READY</span>.
                  {ssdBase && ' Also updates the SSD backup.'}
                </p>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canSubmit) handleConfirm() }}
                  disabled={isWorking}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="New recipe name"
                />
              </div>

              {/* Step progress — only shown while working */}
              {phase === 'working' && (
                <div className="space-y-2">
                  {steps.map(step => {
                    const state = stepStates[step.id] ?? 'pending'
                    return (
                      <div key={step.id} className="flex items-center gap-2.5">
                        {state === 'running' && <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />}
                        {state === 'done'    && <CheckCircle2 size={14} className="text-green-500 shrink-0" />}
                        {state === 'error'   && <AlertTriangle size={14} className="text-red-500 shrink-0" />}
                        {state === 'pending' && <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" />}
                        <span className={`text-xs ${
                          state === 'running' ? 'text-blue-600 dark:text-blue-400 font-medium' :
                          state === 'done'    ? 'text-green-600 dark:text-green-400' :
                          state === 'error'   ? 'text-red-600 dark:text-red-400' :
                          'text-gray-400 dark:text-gray-500'
                        }`}>
                          {step.label}{state === 'running' ? '…' : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Done state */}
          {phase === 'done' && (
            <div className="flex flex-col items-center gap-3 py-2">
              <CheckCircle2 size={36} className="text-green-500" />
              <p className="text-sm font-medium text-gray-900 dark:text-white text-center">
                Recipe renamed successfully
              </p>
            </div>
          )}

          {/* Errors state */}
          {phase === 'errors' && (
            <div className="space-y-3">
              {fatalError ? (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                    <span className="text-xs font-semibold text-red-700 dark:text-red-400">Rename failed</span>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-300">{fatalError}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Rename completed with warnings</span>
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2.5 space-y-1">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Non-critical issues:</p>
                    {nonFatalErrors.map((e, i) => (
                      <p key={i} className="text-xs text-amber-600 dark:text-amber-300">• {e}</p>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          {(phase === 'input' || phase === 'errors') && !fatalError && (
            <>
              {phase === 'input' && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              )}
              {phase === 'input' && (
                <button
                  onClick={handleConfirm}
                  disabled={!canSubmit}
                  className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Rename
                </button>
              )}
              {phase === 'errors' && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              )}
            </>
          )}
          {phase === 'errors' && fatalError && (
            <>
              <button
                onClick={() => { setPhase('input'); setFatalError(null) }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Try again
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Close
              </button>
            </>
          )}
          {phase === 'done' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Done
            </button>
          )}
          {phase === 'working' && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin" />
              Please wait…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
