import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldMissionSection } from '../types'
import type { DraftPhotoRecord, DraftPriceRow, DraftSectionState } from '../lib/fieldCheckDb'
import { newId } from '../lib/fieldCheckIds'
import { compressImage } from '../lib/imageCompress'
import { livePricePerStem } from '../lib/priceRows'

interface Props {
  def: FieldMissionSection
  state: DraftSectionState
  onChange: (next: DraftSectionState) => void
  defaultOpen?: boolean
}

const INPUT =
  'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30'

export default function FieldVisitSectionCard({ def, state, onChange, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [compressing, setCompressing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const photoCount = state.photos.length
  const priceCount = state.priceRows.length

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setCompressing(true)
    try {
      const added: DraftPhotoRecord[] = []
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith('image/')) continue
        const { blob, width, height } = await compressImage(file)
        added.push({ id: newId(), blob, width, height })
      }
      if (added.length > 0) {
        onChange({ ...state, photos: [...state.photos, ...added] })
      }
    } finally {
      setCompressing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removePhoto(id: string) {
    onChange({ ...state, photos: state.photos.filter((p) => p.id !== id) })
  }

  function setNotes(notes: string) {
    onChange({ ...state, notes })
  }

  function addPriceRow() {
    const row: DraftPriceRow = { id: newId(), priceUsd: '', stemCount: '', note: '' }
    onChange({ ...state, priceRows: [...state.priceRows, row] })
  }

  function updatePriceRow(id: string, patch: Partial<DraftPriceRow>) {
    onChange({
      ...state,
      priceRows: state.priceRows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })
  }

  function removePriceRow(id: string) {
    onChange({ ...state, priceRows: state.priceRows.filter((r) => r.id !== id) })
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{def.label}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {photoCount} photo{photoCount !== 1 ? 's' : ''}
            {priceCount > 0 ? ` · ${priceCount} price${priceCount !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">
          {/* Photos */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Photos</label>
            <div className="flex flex-wrap gap-2">
              {state.photos.map((photo) => (
                <PhotoThumb key={photo.id} photo={photo} onRemove={() => removePhoto(photo.id)} />
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={compressing}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-green-400 hover:text-green-600 active:scale-95 transition disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 mb-1">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                <span className="text-[10px] font-medium">{compressing ? 'Compressing…' : 'Add'}</span>
              </button>
            </div>
            {/* capture="environment" opens the rear camera directly on iOS/Android Safari & Chrome;
                it's a hint only (desktop browsers ignore it and fall back to a normal file picker),
                and gallery uploads are still technically possible — same verification gap GoSpotCheck
                had (README §2.1's "Camera Only: No"). Not solvable purely client-side. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
            <textarea
              value={state.notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional information if required"
              rows={2}
              className={`${INPUT} resize-none`}
            />
          </div>

          {/* Competitor prices — structured rows instead of GoSpotCheck's free-text field
              (gospotcheck/README.md §2.3 / §7.6: that's what needed a regex parser and could
              still only ever be 'medium' confidence at best). */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Competitor prices</label>
              <button
                type="button"
                onClick={addPriceRow}
                className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add price
              </button>
            </div>

            {state.priceRows.length === 0 ? (
              <p className="text-xs text-gray-400">No competitor prices recorded for this section.</p>
            ) : (
              <div className="space-y-2">
                {state.priceRows.map((row) => (
                  <PriceRowInput
                    key={row.id}
                    row={row}
                    onChange={(patch) => updatePriceRow(row.id, patch)}
                    onRemove={() => removePriceRow(row.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function PhotoThumb({ photo, onRemove }: { photo: DraftPhotoRecord; onRemove: () => void }) {
  // Each thumb owns its own object URL lifecycle — created once per photo (memoized on the
  // stable Blob reference) and revoked on unmount, i.e. exactly when the photo is removed
  // from the section's array. Avoids coordinating a shared url map across add/remove churn.
  const url = useMemo(() => URL.createObjectURL(photo.blob), [photo.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0">
      <img src={url} alt="" className="w-full h-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

function PriceRowInput({
  row,
  onChange,
  onRemove,
}: {
  row: DraftPriceRow
  onChange: (patch: Partial<DraftPriceRow>) => void
  onRemove: () => void
}) {
  const perStem = livePricePerStem(row)

  return (
    <div className="bg-gray-50 rounded-xl p-2.5 space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={row.priceUsd}
            onChange={(e) => onChange({ priceUsd: e.target.value })}
            placeholder="4.99"
            className="w-full rounded-lg border border-gray-300 bg-white pl-5 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
          />
        </div>
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={row.stemCount}
            onChange={(e) => onChange({ stemCount: e.target.value })}
            placeholder="Stems"
            className="w-full rounded-lg border border-gray-300 bg-white pl-2 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <input
        value={row.note}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder={'Note (optional) — e.g. "No bqts"'}
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/30"
      />
      {perStem != null && (
        <p className="text-[11px] font-medium text-green-700">${perStem.toFixed(3)} / stem</p>
      )}
    </div>
  )
}
