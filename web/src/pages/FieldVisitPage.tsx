import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuthStore } from '../store/authStore'
import type { FieldPlace, VisitFlag } from '../types'
import { FAR_FROM_STORE_THRESHOLD_MILES, FIELD_CHECK_MISSION_ID, FIELD_CHECK_MISSION_NAME, FIELD_CHECK_SECTIONS } from '../types'
import type { DraftSectionState, QueuedVisit, VisitDraft } from '../lib/fieldCheckDb'
import { deleteDraft, loadDraft, saveDraft } from '../lib/fieldCheckDb'
import { newId } from '../lib/fieldCheckIds'
import { getCurrentPosition, type SimpleCoords } from '../lib/geolocation'
import { haversineMiles } from '../lib/haversine'
import { toCompetitorPrices } from '../lib/priceRows'
import { submitVisit } from '../lib/fieldCheckSync'
import FieldVisitSectionCard from '../components/FieldVisitSectionCard'

type SubmitState = 'idle' | 'locating' | 'awaiting-far-confirm' | 'submitting' | 'sent' | 'queued'

function emptySection(): DraftSectionState {
  return { notes: '', priceRows: [], photos: [] }
}

function emptySections(): Record<string, DraftSectionState> {
  const out: Record<string, DraftSectionState> = {}
  FIELD_CHECK_SECTIONS.forEach((s) => { out[s.key] = emptySection() })
  return out
}

export default function FieldVisitPage() {
  const { placeId } = useParams<{ placeId: string }>()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { place?: FieldPlace; distanceMiles?: number } }
  const { user } = useAuthStore()

  const [place, setPlace] = useState<FieldPlace | null>(location.state?.place ?? null)
  const [sections, setSections] = useState<Record<string, DraftSectionState>>(emptySections())
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  // Marks the visit as a system test rather than a real store report. Kept
  // off by default so nobody flags a genuine visit by accident.
  const [isTestVisit, setIsTestVisit] = useState(false)
  const [pendingDistance, setPendingDistance] = useState<number | null>(null)
  const [pendingFlags, setPendingFlags] = useState<VisitFlag[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Resolve the place — from router state if we came from the list (no extra read),
  // otherwise (deep link / reload) a single getDoc.
  useEffect(() => {
    if (place || !placeId) return
    getDoc(doc(db, 'fieldPlaces', placeId)).then((snap) => {
      if (snap.exists()) setPlace({ id: snap.id, ...snap.data() } as FieldPlace)
    })
  }, [placeId, place])

  // Restore any in-progress draft for this store (task E — survives closing the tab/app).
  useEffect(() => {
    if (!placeId) return
    loadDraft(placeId).then((draft) => {
      if (draft) {
        setSections(draft.sections)
        setLastSavedAt(draft.updatedAt)
      }
      setDraftLoaded(true)
    })
  }, [placeId])

  // Autosave to IndexedDB, debounced. Skipped until the initial draft load completes
  // so we don't immediately overwrite a real draft with the blank initial state.
  useEffect(() => {
    if (!draftLoaded || !placeId || !place) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const draft: VisitDraft = {
        draftId: placeId,
        placeId,
        placeName: place.name ?? '',
        sections,
        updatedAt: Date.now(),
      }
      saveDraft(draft).then(() => setLastSavedAt(draft.updatedAt))
    }, 600)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [sections, draftLoaded, placeId, place])

  const totalPhotos = useMemo(
    () => Object.values(sections).reduce((sum, s) => sum + s.photos.length, 0),
    [sections]
  )

  function updateSection(key: string, next: DraftSectionState) {
    setSections((prev) => ({ ...prev, [key]: next }))
  }

  async function computeDistanceAndFlags(): Promise<{ pos: SimpleCoords | null; distanceMiles: number; flags: VisitFlag[] }> {
    let pos: SimpleCoords | null = null
    try {
      pos = await getCurrentPosition()
    } catch {
      pos = null // no GPS at submit time — proceed without blocking; distance stays 0/unflagged
    }

    const distanceMiles =
      pos && place?.lat != null && place?.lon != null ? haversineMiles(pos.lat, pos.lon, place.lat, place.lon) : 0

    const flags: VisitFlag[] = []
    if (pos && distanceMiles > FAR_FROM_STORE_THRESHOLD_MILES) flags.push('far_from_store')
    if (totalPhotos === 0) flags.push('no_photos')
    if (flags.length === 0) flags.push('ok')

    return { pos, distanceMiles, flags }
  }

  async function handleSendTap() {
    if (!place || !user) return
    setError(null)

    // Second tap after a far-from-store warning — send regardless (task D: advise, don't block).
    if (submitState === 'awaiting-far-confirm') {
      await doSubmit(pendingDistance ?? 0, pendingFlags ?? ['far_from_store'])
      return
    }

    setSubmitState('locating')
    const { distanceMiles, flags } = await computeDistanceAndFlags()
    if (isTestVisit) flags.push('test_visit')

    // A test visit is expected to be sent from anywhere, so the
    // far-from-store warning would be noise. The real distance is still
    // recorded, and the dashboard hides these by default.
    if (flags.includes('far_from_store') && !isTestVisit) {
      setPendingDistance(distanceMiles)
      setPendingFlags(flags)
      setSubmitState('awaiting-far-confirm')
      return
    }

    await doSubmit(distanceMiles, flags)
  }

  async function doSubmit(distanceMiles: number, flags: VisitFlag[]) {
    if (!place || !user) return
    setSubmitState('submitting')

    const visitId = newId()
    const item: QueuedVisit = {
      queueId: visitId,
      visitId,
      placeId: place.id,
      placeName: place.name ?? '',
      createdAt: Date.now(),
      attempts: 0,
      lastError: null,
      base: {
        missionId: FIELD_CHECK_MISSION_ID,
        missionName: FIELD_CHECK_MISSION_NAME,
        placeId: place.id,
        customPlaceId: place.customPlaceId ?? '',
        placeName: place.name ?? '',
        userUid: user.uid,
        userEmail: user.email,
        userLabel: user.name || user.email,
        completedAt: Date.now(),
        distanceMiles,
        flags,
      },
      sections: FIELD_CHECK_SECTIONS.map((def) => {
        const s = sections[def.key]
        return {
          key: def.key,
          label: def.label,
          notes: s.notes,
          parsedPrices: toCompetitorPrices(s.priceRows, def.key),
          photos: s.photos.map((p) => ({ photoId: p.id, blob: p.blob, width: p.width, height: p.height })),
        }
      }),
    }

    try {
      const outcome = await submitVisit(item)
      await deleteDraft(place.id)
      setSubmitState(outcome)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit visit')
      setSubmitState('idle')
    }
  }

  if (!place) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (submitState === 'sent' || submitState === 'queued') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${submitState === 'sent' ? 'bg-green-100' : 'bg-amber-100'}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke={submitState === 'sent' ? '#1D9E75' : '#92400E'} strokeWidth="2" className="w-7 h-7">
            {submitState === 'sent' ? (
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M12 8v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">
          {submitState === 'sent' ? 'Visit sent' : 'Visit saved — queued'}
        </h1>
        <p className="text-sm text-gray-500 mb-5 max-w-xs">
          {submitState === 'sent'
            ? `${place.name} has been recorded.`
            : `No connection right now. This visit for ${place.name} will send automatically once you're back online.`}
        </p>
        <button
          onClick={() => navigate('/field-check')}
          className="rounded-xl bg-green-500 text-white text-sm font-semibold px-5 py-2.5 hover:bg-green-600 active:scale-95 transition"
        >
          Back to Field Check
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 safe-top">
        <header className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/field-check')} className="text-gray-400 hover:text-gray-600 p-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-gray-900 truncate">{place.name}</h1>
            <p className="text-xs text-gray-400 truncate">
              {[place.address, place.city, place.state].filter(Boolean).join(', ')}
            </p>
          </div>
        </header>
        {lastSavedAt && (
          <p className="px-4 pb-2 text-[11px] text-gray-400">Draft saved locally</p>
        )}
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-3 pb-32">
        {FIELD_CHECK_SECTIONS.map((def, i) => (
          <FieldVisitSectionCard
            key={def.key}
            def={def}
            state={sections[def.key]}
            onChange={(next) => updateSection(def.key, next)}
            defaultOpen={i === 0}
          />
        ))}
      </main>

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-gray-200 safe-bottom">
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
          {submitState === 'awaiting-far-confirm' && pendingDistance != null && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              You&apos;re {pendingDistance.toFixed(2)} miles from {place.name}. This visit will be flagged. Tap Send again to confirm.
            </p>
          )}
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <label className="flex items-center gap-2 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={isTestVisit}
              onChange={(e) => setIsTestVisit(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-500"
            />
            <span>Test visit — kept out of reports, and no distance warning</span>
          </label>
          <button
            onClick={handleSendTap}
            disabled={submitState === 'locating' || submitState === 'submitting'}
            className="w-full rounded-xl bg-green-500 text-white py-3.5 text-sm font-semibold hover:bg-green-600 active:scale-95 transition disabled:opacity-50"
          >
            {submitState === 'locating' && 'Checking location…'}
            {submitState === 'submitting' && 'Sending…'}
            {submitState === 'awaiting-far-confirm' && 'Send anyway'}
            {(submitState === 'idle') && `Send visit${totalPhotos > 0 ? ` · ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
