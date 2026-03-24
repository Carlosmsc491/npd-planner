// src/renderer/src/components/ui/WelcomeWizard.tsx
// Full-screen onboarding wizard shown on first login (active user with no SharePoint path)

import { useState } from 'react'
import { CheckCircle2, FolderOpen, Wifi, WifiOff, ChevronRight, SkipForward } from 'lucide-react'
import { updateUserPreferences } from '../../lib/firestore'
import type { AppUser } from '../../types'

interface Props {
  user: AppUser
  onComplete: () => void
}

type Step = 1 | 2 | 3 | 4

export default function WelcomeWizard({ user, onComplete }: Props) {
  const [step, setStep] = useState<Step>(1)

  // Step 2 — SharePoint
  const [spPath, setSpPath] = useState('')
  const [spVerified, setSpVerified] = useState(false)
  const [spError, setSpError] = useState<string | null>(null)
  const [spVerifying, setSpVerifying] = useState(false)

  // Step 3 — Traze
  const [trazeEmail, setTrazeEmail] = useState('')
  const [trazePassword, setTrazePassword] = useState('')
  const [trazeTested, setTrazeTested] = useState(false)
  const [trazeOk, setTrazeOk] = useState(false)
  const [trazeError, setTrazeError] = useState<string | null>(null)
  const [trazeTesting, setTrazeTesting] = useState(false)
  const [trazeSaved, setTrazeSaved] = useState(false)

  async function handleBrowse() {
    setSpVerified(false)
    setSpError(null)
    const folder = await window.electronAPI.selectFolder()
    if (folder) setSpPath(folder)
  }

  async function handleVerify() {
    if (!spPath) return
    setSpVerifying(true)
    setSpError(null)
    try {
      const result = await window.electronAPI.verifySharePointFolder(spPath, 'REPORTS (NPD-SECURE)')
      if (result.valid) {
        setSpVerified(true)
      } else {
        setSpError(result.error ?? 'Folder not recognized. Make sure it contains REPORTS (NPD-SECURE).')
      }
    } catch {
      setSpError('Verification failed. Please try again.')
    } finally {
      setSpVerifying(false)
    }
  }

  async function handleNextFromSharePoint() {
    if (!spVerified) return
    await updateUserPreferences(user.uid, { sharePointPath: spPath })
    localStorage.setItem('npd_sharepoint_path', spPath)
    setStep(3)
  }

  async function handleTestTraze() {
    if (!trazeEmail || !trazePassword) return
    setTrazeTesting(true)
    setTrazeError(null)
    try {
      await window.electronAPI.invoke('traze:save-credentials', { email: trazeEmail, password: trazePassword })
      const result = await window.electronAPI.invoke('traze:check-auth') as { authenticated: boolean }
      setTrazeTested(true)
      if (result.authenticated) {
        setTrazeOk(true)
        setTrazeSaved(true)
      } else {
        setTrazeOk(false)
        setTrazeError('Login failed. Please check your credentials.')
      }
    } catch (err) {
      setTrazeTested(true)
      setTrazeOk(false)
      setTrazeError(err instanceof Error ? err.message : 'Connection failed.')
    } finally {
      setTrazeTesting(false)
    }
  }

  async function handleSkipTraze() {
    setStep(4)
  }

  async function handleNextFromTraze() {
    setStep(4)
  }

  const dots = [1, 2, 3, 4] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6 pb-2">
          {dots.map(d => (
            <div
              key={d}
              className={`h-2 rounded-full transition-all duration-300 ${
                d === step ? 'w-6 bg-green-500' : d < step ? 'w-2 bg-green-300' : 'w-2 bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="px-8 py-6">

          {/* ── STEP 1: Welcome ── */}
          {step === 1 && (
            <div className="text-center space-y-4">
              <div className="text-5xl mb-2">🌿</div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome to NPD Planner</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                Let's set up your workspace in a few quick steps so you're ready to go.
              </p>
              <button
                onClick={() => setStep(2)}
                className="mt-4 flex items-center gap-2 mx-auto px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold text-sm transition-colors"
              >
                Get Started <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ── STEP 2: SharePoint ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Connect your SharePoint folder</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Select the folder where SharePoint syncs on your computer. It should contain a subfolder called{' '}
                  <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">REPORTS (NPD-SECURE)</span>.
                  Usually under <span className="italic">OneDrive - Elite Flower/</span>
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={spPath}
                  placeholder="No folder selected..."
                  className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 truncate"
                />
                <button
                  onClick={handleBrowse}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors"
                >
                  <FolderOpen size={14} /> Browse
                </button>
              </div>

              {spPath && !spVerified && (
                <button
                  onClick={handleVerify}
                  disabled={spVerifying}
                  className="w-full py-2 rounded-lg border border-green-500 text-green-600 dark:text-green-400 text-sm font-medium hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                >
                  {spVerifying ? 'Verifying…' : 'Verify Folder'}
                </button>
              )}

              {spVerified && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                  <CheckCircle2 size={16} /> Folder verified ✓
                </div>
              )}

              {spError && (
                <p className="text-red-500 dark:text-red-400 text-xs">{spError}</p>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleNextFromSharePoint}
                  disabled={!spVerified}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Traze ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Connect to Traze <span className="text-sm font-normal text-gray-400">(optional)</span></h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  If you track AWB shipments, enter your Traze credentials. They're stored securely on your device — never sent to any server except Traze.
                </p>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={trazeEmail}
                  onChange={e => { setTrazeEmail(e.target.value); setTrazeTested(false) }}
                  placeholder="Traze username / email"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm dark:text-white focus:outline-none focus:border-green-500"
                />
                <input
                  type="password"
                  value={trazePassword}
                  onChange={e => { setTrazePassword(e.target.value); setTrazeTested(false) }}
                  placeholder="Password"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm dark:text-white focus:outline-none focus:border-green-500"
                />
              </div>

              {trazeEmail && trazePassword && !trazeSaved && (
                <button
                  onClick={handleTestTraze}
                  disabled={trazeTesting}
                  className="w-full py-2 rounded-lg border border-blue-500 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                >
                  {trazeTesting ? 'Testing connection…' : 'Test Connection'}
                </button>
              )}

              {trazeTested && trazeOk && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                  <Wifi size={16} /> Connected ✓
                </div>
              )}
              {trazeTested && !trazeOk && trazeError && (
                <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm">
                  <WifiOff size={16} /> {trazeError}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleSkipTraze}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <SkipForward size={14} /> Skip for now
                </button>
                <button
                  onClick={handleNextFromTraze}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Done ── */}
          {step === 4 && (
            <div className="text-center space-y-5">
              <div className="text-5xl">🎉</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">You're all set!</h2>
              <div className="text-left space-y-2 bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  SharePoint folder connected
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  {trazeSaved
                    ? <><CheckCircle2 size={16} className="text-green-500 shrink-0" /> Traze connected</>
                    : <><span className="text-gray-400 text-base leading-none">⊘</span> <span className="text-gray-400">Traze skipped — set up later in Settings</span></>
                  }
                </div>
              </div>
              <button
                onClick={onComplete}
                className="flex items-center gap-2 mx-auto px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold text-sm transition-colors"
              >
                Go to Dashboard <ChevronRight size={16} />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
