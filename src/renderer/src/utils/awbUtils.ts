/**
 * AWB Utility Functions
 * =====================
 * File path: src/renderer/utils/awbUtils.ts
 *
 * Handles AWB number normalization and CSV parsing.
 * Used by the renderer to look up AWBs in the downloaded CSV.
 *
 * AWB FORMAT NOTES:
 *   369-9824-2535   → user input with dashes
 *   369-98242535    → user input partial dashes
 *   36998242535     → no dashes
 *   All refer to the same AWB. Normalize by stripping non-digits.
 *
 * CSV COLUMN MAPPING (Traze export):
 *   "Full AWB/BOL" → AWB number
 *   "carrier"      → Carrier name
 *   "ETA"          → Estimated Time of Arrival
 *   "ATA"          → Actual Time of Arrival
 *   "SHIP DATE"    → Ship date
 */

// ─── AWB Normalization ────────────────────────────────────────────────────────

/**
 * Strips all non-digit characters from an AWB number.
 * "369-9824-2535" → "36998242535"
 */
export function normalizeAwb(awb: string): string {
  return awb.replace(/\D/g, '');
}

/**
 * Checks if two AWB numbers refer to the same shipment.
 * Handles all format variations (dashes, spaces, partial matches).
 *
 * Strategy:
 *   1. Exact match after normalization
 *   2. Substring match (one contains the other)
 *   3. Serial number fallback: match last 8 digits (after airline code)
 */
export function awbsMatch(userAwb: string, csvAwb: string): boolean {
  const userNorm = normalizeAwb(userAwb);
  const csvNorm  = normalizeAwb(csvAwb);

  if (!userNorm || !csvNorm) return false;

  // 1. Exact match
  if (userNorm === csvNorm) return true;

  // 2. Substring match (handles truncated or extended formats)
  if (userNorm.length >= 5 && csvNorm.includes(userNorm)) return true;
  if (csvNorm.length >= 5 && userNorm.includes(csvNorm)) return true;

  // 3. Serial number fallback: last 8 digits (the unique serial portion)
  //    Standard airline AWB: 3-digit code + 8-digit serial
  //    If user entered 11 digits, last 8 are the serial
  if (userNorm.length >= 8) {
    const serial = userNorm.slice(-8);
    if (serial.length === 8 && csvNorm.includes(serial)) return true;
  }

  // 4. 5-digit fallback: if exact and serial don't match, try 5-digit substring
  if (userNorm.length >= 5) {
    const partial = userNorm.slice(-5);
    if (csvNorm.includes(partial)) return true;
  }

  return false;
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

export interface CsvAwbRow {
  awb: string
  carrier: string
  shipDate: string
  eta: string
  ata: string
}

/**
 * Parses a raw CSV string from the Traze export.
 * Returns an array of CsvAwbRow objects.
 *
 * Expected CSV headers (case-insensitive):
 *   Full AWB/BOL, carrier, ETA, ATA, SHIP DATE
 */
export function parseTrazeCsv(csvContent: string): CsvAwbRow[] {
  const lines = csvContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);

  // Find column indices (case-insensitive, trim whitespace)
  const findCol = (name: string): number =>
    headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase().trim());

  const colAwb      = findCol('Full AWB/BOL');
  const colCarrier  = findCol('carrier');
  const colShipDate = findCol('ship date');
  const colEta      = findCol('eta');
  const colAta      = findCol('ata');

  const rows: CsvAwbRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const awb = (cells[colAwb] ?? '').trim();
    if (!awb) continue; // skip empty rows

    rows.push({
      awb,
      carrier:  (cells[colCarrier]  ?? '').trim(),
      shipDate: (cells[colShipDate] ?? '').trim(),
      eta:      (cells[colEta]      ?? '').trim(),
      ata:      (cells[colAta]      ?? '').trim(),
    });
  }

  return rows;
}

/**
 * Parses a single CSV line, handling quoted fields with commas inside.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

/**
 * Finds the CSV row matching a given AWB number.
 * Returns null if not found.
 */
export function findAwbInCsv(awbNumber: string, rows: CsvAwbRow[]): CsvAwbRow | null {
  return rows.find(row => awbsMatch(awbNumber, row.awb)) ?? null;
}

/**
 * Checks if two ETA strings represent the same date/time.
 * Handles empty strings, null, and minor whitespace differences.
 */
export function etaChanged(oldEta: string | null, newEta: string): boolean {
  if (!newEta.trim()) return false;              // CSV has no ETA → ignore
  if (!oldEta) return !!newEta.trim();           // first time seeing ETA
  return oldEta.trim() !== newEta.trim();
}
