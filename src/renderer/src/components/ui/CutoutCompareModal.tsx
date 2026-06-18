// CutoutCompareModal.tsx — side-by-side "which cut-out do you want to keep?"
// Shown after the user runs Photoshop Select Subject on a photo: the engine cut
// on the left, the Photoshop cut on the right; pick one. Reused by Background
// Removal and Photo Manager.

import { Loader2, Check, X } from 'lucide-react'

const ACCENT = '#1D9E75'
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,#d9d9d9 25%,transparent 25%),linear-gradient(-45deg,#d9d9d9 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d9d9d9 75%),linear-gradient(-45deg,transparent 75%,#d9d9d9 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
  backgroundColor: '#f0f0f0',
}

export default function CutoutCompareModal({
  title, engineUrl, subjectUrl, busy, onChoose, onCancel,
}: {
  title?: string
  engineUrl: string | null
  subjectUrl: string | null
  busy: boolean
  onChoose: (keepSubject: boolean) => void
  onCancel: () => void
}) {
  const panel = (label: string, url: string | null, keepSubject: boolean) => (
    <div className="flex flex-1 flex-col">
      <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/70">{label}</div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg" style={CHECKER}>
        {url
          ? <img src={url} alt={label} className="max-h-[62vh] max-w-full object-contain" />
          : <div className="flex h-72 w-72 items-center justify-center"><Loader2 size={26} className="animate-spin text-gray-500" /></div>}
      </div>
      <button
        onClick={() => onChoose(keepSubject)}
        disabled={busy || !url}
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Keep this one
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 p-6">
      <div className="mb-3 flex items-center gap-3 text-white">
        <span className="text-sm font-medium">{title || 'Which cut-out do you want to keep?'}</span>
        <button onClick={onCancel} disabled={busy} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/30 disabled:opacity-50">
          <X size={16} />
        </button>
      </div>
      <div className="flex w-full max-w-5xl flex-1 gap-5 overflow-hidden">
        {panel('Our engine', engineUrl, false)}
        {panel('Photoshop Select Subject', subjectUrl, true)}
      </div>
    </div>
  )
}
