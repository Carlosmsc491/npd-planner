// New screen between "pick a store" and "fill out the form" (task B) — a
// merchandiser now picks which mission they're running at this store
// (Sales Team / Competitive Intelligence Analysis / UPC Check / whatever
// else gets added), instead of always landing on one hardcoded form.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { FieldMission, FieldPlace } from '../types'
import { loadDraft } from '../lib/fieldCheckDb'
import { loadFieldMissions } from '../lib/fieldMissions'

export default function FieldMissionListPage() {
  const { placeId } = useParams<{ placeId: string }>()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { place?: FieldPlace; distanceMiles?: number } }

  const [place, setPlace] = useState<FieldPlace | null>(location.state?.place ?? null)
  const [missions, setMissions] = useState<FieldMission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftMissionIds, setDraftMissionIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (place || !placeId) return
    getDoc(doc(db, 'fieldPlaces', placeId)).then((snap) => {
      if (snap.exists()) setPlace({ id: snap.id, ...snap.data() } as FieldPlace)
    })
  }, [placeId, place])

  useEffect(() => {
    loadFieldMissions()
      .then(setMissions)
      .catch(() => setError('Could not load missions. Check your connection and try again.'))
  }, [])

  // "In progress" badges — cheap local IndexedDB lookups, one per mission.
  useEffect(() => {
    if (!placeId || !missions) return
    let cancelled = false
    Promise.all(missions.map((m) => loadDraft(placeId, m.id).then((d) => (d ? m.id : null)))).then((ids) => {
      if (!cancelled) setDraftMissionIds(new Set(ids.filter((id): id is string => id !== null)))
    })
    return () => {
      cancelled = true
    }
  }, [placeId, missions])

  function openMission(mission: FieldMission) {
    navigate(`/field-check/${placeId}/${mission.id}`, {
      state: { place, distanceMiles: location.state?.distanceMiles, mission },
    })
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
            <h1 className="font-bold text-gray-900 truncate">{place?.name ?? 'Loading store…'}</h1>
            {place && (
              <p className="text-xs text-gray-400 truncate">
                {[place.address, place.city, place.state].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </header>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">Choose a mission</h2>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {!error && missions === null && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
            <div className="h-4 w-4 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
            Loading missions…
          </div>
        )}

        {missions !== null && missions.length === 0 && (
          <p className="text-sm text-gray-400 px-1">No active missions are configured right now.</p>
        )}

        {missions?.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            hasDraft={draftMissionIds.has(mission.id)}
            onClick={() => openMission(mission)}
          />
        ))}
      </main>
    </div>
  )
}

function MissionCard({ mission, hasDraft, onClick }: { mission: FieldMission; hasDraft: boolean; onClick: () => void }) {
  const requiredCount = mission.sections.reduce((sum, s) => sum + s.tasks.filter((t) => t.required).length, 0)
  const taskCount = mission.sections.reduce((sum, s) => sum + s.tasks.length, 0)

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 hover:border-gray-300 hover:shadow active:scale-[0.99] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900">{mission.name}</p>
            {hasDraft && (
              <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">
                In progress
              </span>
            )}
          </div>
          {mission.instructions && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-3">{mission.instructions}</p>
          )}
          <p className="text-[11px] text-gray-400 mt-1.5">
            {mission.sections.length} section{mission.sections.length !== 1 ? 's' : ''} · {taskCount} task
            {taskCount !== 1 ? 's' : ''}
            {requiredCount > 0 ? ` · ${requiredCount} required` : ''}
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-300 shrink-0 mt-1">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  )
}
