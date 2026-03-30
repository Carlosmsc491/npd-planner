In OrderStatusSection.tsx, make these changes to the AWB table display:

1. REMOVE the "changed" badge entirely. Delete the entire button/popover block that checks `safeAwb.etaChanged` in the ETA cell. Just show the ETA value as plain text (or "—").

2. ADD a helper function at the top of the file (before the components):

function formatFlightDate(val: string | null): string {
  if (!val) return '—'
  // Filter out year 1900 (default/empty sentinel from backend)
  if (val.includes('1900')) return '—'
  // Parse "MM/DD/YYYY HH:mm" or "MM/DD/YYYY"
  const parts = val.trim().split(' ')
  const datePart = parts[0] // "MM/DD/YYYY"
  const timePart = parts[1] // "HH:mm" or undefined
  const dateSplit = datePart.split('/')
  if (dateSplit.length < 3) return val
  const month = dateSplit[0]
  const day = dateSplit[1]
  // No year — saves space
  let result = `${month}/${day}`
  if (timePart) {
    const [hh, mm] = timePart.split(':').map(Number)
    const ampm = hh >= 12 ? 'PM' : 'AM'
    const hour12 = hh % 12 === 0 ? 12 : hh % 12
    result += ` ${hour12}:${String(mm).padStart(2, '0')} ${ampm}`
  }
  return result
}

3. Replace every display of `safeAwb.eta`, `safeAwb.ata`, and `safeAwb.shipDate` in the table cells with `formatFlightDate(safeAwb.eta)`, `formatFlightDate(safeAwb.ata)`, `formatFlightDate(safeAwb.shipDate)` respectively.

Run npm run typecheck after.

Prompt 2 — FlightStatusPanel: quitar Guía, separar ETA y ATA
File: src/renderer/src/components/dashboard/FlightStatusPanel.tsx
In FlightStatusPanel.tsx, make these changes:

1. REMOVE the "Guía" column completely:
   - Remove the <th> header for Guía
   - Remove the <td> cell that renders row.guia
   - Remove the `guia` field from the FlightRow interface

2. REPLACE the single "Scheduled" column with TWO separate columns: "ETA" and "ATA":
   - In the <thead>, replace:
     <th ...>Scheduled</th>
   With:
     <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">ETA</th>
     <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">ATA</th>

3. In the <tbody> row, replace the single "Scheduled" <td> with TWO cells:

ADD this helper function at the top of the file (after imports):

function fmtDate(val: string | null): string {
  if (!val) return '—'
  if (val.includes('1900')) return '—'
  const parts = val.trim().split(' ')
  const [m, d] = parts[0].split('/')
  let result = `${m}/${d}`
  if (parts[1]) {
    const [hh, mm] = parts[1].split(':').map(Number)
    const ampm = hh >= 12 ? 'PM' : 'AM'
    const h12 = hh % 12 === 0 ? 12 : hh % 12
    result += ` ${h12}:${String(mm).padStart(2, '0')} ${ampm}`
  }
  return result
}

Replace the Scheduled <td> with:
  <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
    {fmtDate(row.eta)}
  </td>
  <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
    {fmtDate(row.ata)}
  </td>

4. Also in the FlightRow interface, the `guia` field is no longer needed — remove it. Also remove it from the useMemo where rows are constructed (the `guia: awb.guia ?? null` line).

Run npm run typecheck after.