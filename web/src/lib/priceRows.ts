import type { CompetitorPrice } from '../types'
import { SECTION_PRODUCT_HINT } from '../types'
import type { DraftPriceRow } from './fieldCheckDb'

/** Live price-per-stem for a row being edited — same formula used at submit time, just not rounded/finalized yet. */
export function livePricePerStem(row: DraftPriceRow): number | null {
  const price = Number(row.priceUsd)
  const stems = Number(row.stemCount)
  if (!row.priceUsd.trim() || Number.isNaN(price)) return null
  if (!row.stemCount.trim() || Number.isNaN(stems) || stems <= 0) return null
  return price / stems
}

/**
 * Converts structured price rows into CompetitorPrice[] at submit time.
 * confidence is always 'high' because these come from numeric form fields,
 * not free-text parsing (see gospotcheck/README.md §7.6 — the original
 * GoSpotCheck textarea needed a regex parser and could never be fully
 * trusted; that's the whole reason this form has real inputs instead).
 */
export function toCompetitorPrices(rows: DraftPriceRow[], sectionKey: string): CompetitorPrice[] {
  return rows
    .filter((r) => r.priceUsd.trim() !== '')
    .map((r) => {
      const priceUsd = Number(r.priceUsd)
      if (Number.isNaN(priceUsd)) return null
      const stemCount = r.stemCount.trim() !== '' && !Number.isNaN(Number(r.stemCount)) ? Number(r.stemCount) : null
      const pricePerStem = stemCount ? Number((priceUsd / stemCount).toFixed(3)) : null
      const note = r.note.trim()
      const raw = `$${priceUsd.toFixed(2)}${stemCount ? ` (${stemCount} stems)` : ''}${note ? ` — ${note}` : ''}`
      const price: CompetitorPrice = {
        raw,
        priceUsd,
        stemCount,
        pricePerStem,
        productHint: SECTION_PRODUCT_HINT[sectionKey] ?? null,
        confidence: 'high',
      }
      return price
    })
    .filter((p): p is CompetitorPrice => p !== null)
}
