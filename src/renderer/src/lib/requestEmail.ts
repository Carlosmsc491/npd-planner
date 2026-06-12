// src/renderer/src/lib/requestEmail.ts
// Manual email updates for sample requests. No backend email service yet
// (free tier — no Cloud Functions): we build a mailto: URL with everything
// prefilled and open it in the user's mail app via shell.openExternal.

import type { SampleRequest } from '../types'
import { SAMPLE_REQUEST_STATUS_LABELS } from '../types'

export interface RequestEmailFields {
  date: string       // e.g. "2026-06-12"
  truck: string      // carrier / truck info
  clientName: string
  extraNotes: string // free text
}

/** Recipients deduped and joined; empty strings dropped. */
export function buildRecipientList(emails: (string | null | undefined)[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of emails) {
    const email = (e ?? '').trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out.join(',')
}

/**
 * Builds the mailto: URL for a request update. Pure — unit tested.
 * Example use: "the flower arrived, NPD finished, pallet goes to shipping".
 */
export function buildRequestEmailUrl(
  request: Pick<SampleRequest, 'title' | 'teamName' | 'bucket' | 'status' | 'orderNumber' | 'awbNumber'>,
  recipients: string,
  fields: RequestEmailFields
): string {
  const subject = `[NPD Planner] ${request.title} — ${SAMPLE_REQUEST_STATUS_LABELS[request.status]}`

  const lines = [
    `Request: ${request.title}`,
    `Team: ${request.teamName}`,
    `Type: ${request.bucket}`,
    `Status: ${SAMPLE_REQUEST_STATUS_LABELS[request.status]}`,
    '',
    `Date: ${fields.date}`,
    `Truck / Carrier: ${fields.truck}`,
    `Client: ${fields.clientName}`,
  ]
  if (request.orderNumber) lines.push(`Order #: ${request.orderNumber}`)
  if (request.awbNumber) lines.push(`AWB: ${request.awbNumber}`)
  if (fields.extraNotes.trim()) {
    lines.push('', fields.extraNotes.trim())
  }
  lines.push('', '— Sent from NPD Planner')

  return `mailto:${recipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
}
