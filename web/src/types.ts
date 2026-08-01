import type { Timestamp } from 'firebase/firestore'

export interface AppUser {
  uid: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'photographer'
  status: 'active' | 'awaiting' | 'suspended'
  areaPermissions?: Record<string, string>
}

export interface SelectOption {
  id: string
  label: string
  color: string
  icon?: string
}

export interface BoardProperty {
  id: string
  name: string
  type: string
  icon: string
  options?: SelectOption[]
  order: number
}

export interface Board {
  id: string
  name: string
  color: string
  type: 'planner' | 'trips' | 'vacations' | 'custom'
  order: number
  customProperties?: BoardProperty[]
  bucketOrder?: string[]
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
  assigneeUid: string | null
}

export interface TaskAttachment {
  id: string
  name: string
  sharePointRelativePath: string
  uploadedBy: string
  uploadedByName?: string
  uploadedAt: Timestamp | null
  status: string
  sizeBytes: number | null
  mimeType: string | null
}

export interface EmailInnerAttachment {
  id: string
  name: string
  sharePointRelativePath: string
  sizeBytes: number | null
  mimeType: string | null
}

export interface EmailAttachment {
  id: string
  type: 'email'
  from: string
  subject: string
  date: Timestamp | null
  bodySnippet: string
  msgRelativePath: string
  innerAttachments: EmailInnerAttachment[]
  uploadedBy: string
  uploadedByName?: string
  uploadedAt: Timestamp | null
}

export interface PoEntry {
  id: string
  number: string
  boxes: number
}

export interface AwbEntry {
  id: string
  number: string
  boxes: number
  carrier: string | null
  shipDate: string | null
  eta: string | null
  ata: string | null
  guia: string | null
}

export interface TaskDate {
  id: string
  typeKey: string
  dateStart: Timestamp
  dateEnd: Timestamp | null
}

export interface Task {
  id: string
  boardId: string
  title: string
  clientId: string
  divisionId?: string | null
  status: 'todo' | 'inprogress' | 'review' | 'done'
  priority: 'normal' | 'high'
  assignees: string[]
  labelIds: string[]
  bucket: string
  dateStart: Timestamp | null
  dateEnd: Timestamp | null
  taskDates?: TaskDate[]
  description?: string
  notes: string
  poNumber?: string
  poNumbers?: string[]
  poEntries?: PoEntry[]
  awbs?: AwbEntry[]
  subtasks?: Subtask[]
  attachments?: TaskAttachment[]
  emailAttachments?: EmailAttachment[]
  completed: boolean
  createdBy: string
  createdAt: Timestamp
}

export interface Client {
  id: string
  name: string
  active: boolean
}

export interface Division {
  id: string
  clientId: string
  name: string
  active: boolean
}

export interface Label {
  id: string
  name: string
  color: string
  textColor: string
  boardId: string | null
}

export interface DateType {
  id: string
  key: string
  label: string
  icon: string
  color: string
  order: number
}

export const STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

export const STATUS_COLORS: Record<Task['status'], { bg: string; text: string }> = {
  todo:       { bg: '#F1EFE8', text: '#444441' },
  inprogress: { bg: '#FAEEDA', text: '#633806' },
  review:     { bg: '#E6F1FB', text: '#0C447C' },
  done:       { bg: '#E1F5EE', text: '#085041' },
}

// Default bucket order per board type (matches desktop BOARD_BUCKETS)
export const BOARD_BUCKETS: Record<string, string[]> = {
  planner:   ['SAMPLES/SHIP OUT', 'FedEx', 'IN HOUSE MEETING', 'PICTURES', 'WORKSHOPS', 'SHOWS', 'EVENTS'],
  trips:     ['Confirmed', 'Pending', 'Completed'],
  vacations: ['Approved', 'Pending', 'Rejected'],
  custom:    [],
}

/** Bucket color from board's "Bucket" custom property options (matches desktop getBucketColor) */
export function getBucketColor(bucketName: string | undefined, board: Board | null | undefined): string | undefined {
  if (!bucketName || !board) return undefined
  const bucketProp = board.customProperties?.find(
    (p) => p.id === 'builtin-bucket' || p.name === 'Bucket'
  )
  return bucketProp?.options?.find((o) => o.label === bucketName)?.color
}

const INITIAL_COLORS = ['#1D9E75', '#378ADD', '#D4537E', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

export function getInitialsColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return INITIAL_COLORS[Math.abs(hash) % INITIAL_COLORS.length]
}

export function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// ─────────────────────────────────────────────────────────────────────────
// Field Check (GoSpotCheck replacement) — merchandiser store visits.
//
// FieldMission / VisitFlag / CompetitorPrice / FieldPhoto / FieldVisitSection
// / FieldVisit mirror src/renderer/src/types/index.ts (the desktop contract)
// field-for-field. Do not rename fields here — the desktop app, Photo
// Manager pipeline, and Firestore rules (see firestore.rules "FIELD CHECK")
// all assume this exact shape.
//
// FieldPlace below is NOT copied from the desktop interface — it reflects
// what gospotcheck/scripts/build_import.py actually writes to the
// `fieldPlaces` collection (verified by reading the script), which is a
// narrower field set than the desktop's aspirational interface (no
// clientId/lastVisitedAt/visitCount — those aren't populated by the bulk
// import).
// ─────────────────────────────────────────────────────────────────────────

/** fieldPlaces/{placeId} — populated by gospotcheck/scripts/build_import.py + import_fieldplaces.py. */
export interface FieldPlace {
  id: string                  // Firestore doc id == GoSpotCheck place id ("docId" in the import script)
  customPlaceId: string | null
  name: string | null
  address: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  chain: string | null
  industry: string | null
  active: boolean
  lat: number | null          // ZIP-centroid geocode (Census gazetteer) — not the exact storefront
  lon: number | null
  geohash: string | null      // standard base32 geohash, precision 9 — see lib/geohash.ts
}

export interface FieldMissionSection {
  key: string
  label: string
  description: string | null
  maxPhotos: number
}

export interface FieldMission {
  id: string
  name: string
  instructions: string
  sections: FieldMissionSection[]
  active: boolean
}

export type VisitFlag = 'ok' | 'far_from_store' | 'no_photos' | 'stale_photos'

export interface CompetitorPrice {
  raw: string                 // reconstructed "$4.99 (7 stems) — note" — always kept even though this
                               // capture form is structured, so downstream code doesn't have to special-case it
  priceUsd: number
  stemCount: number | null
  pricePerStem: number | null
  productHint: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface FieldPhoto {
  gscPhotoId: string           // reused field name for natively-captured photos too (locally generated id)
  remoteUrl: string
  localPath: string | null     // filled in later by a desktop-side SharePoint sync — never set from the PWA
  downloadedAt: Timestamp | null
  width: number | null
  height: number | null
}

export interface FieldVisitSection {
  key: string
  label: string
  photos: FieldPhoto[]
  notes: string
  parsedPrices: CompetitorPrice[]
}

export interface FieldVisit {
  id: string
  missionId: string
  missionName: string
  placeId: string
  customPlaceId: string
  placeName: string
  userUid: string
  userEmail: string
  userLabel: string
  completedAt: Timestamp
  distanceMiles: number
  flags: VisitFlag[]
  sections: FieldVisitSection[]
  syncedAt: Timestamp
}

/** Fixed "Sales Team" mission — see gospotcheck/README.md §2.1. Hardcoded rather than
 *  read from `fieldMissions` (which is admin-managed reference data, rarely if ever
 *  edited) to avoid a Firestore read on every visit to the capture form. */
export const FIELD_CHECK_MISSION_ID = 'sales_team_v1'
export const FIELD_CHECK_MISSION_NAME = 'Sales Team'

export const FIELD_CHECK_SECTIONS: FieldMissionSection[] = [
  { key: 'entrance', label: 'Entrance with flowers and/or plants', description: null, maxPhotos: 50 },
  { key: 'floral_department', label: 'Floral Department', description: null, maxPhotos: 50 },
  { key: 'bouquets', label: 'Bouquets', description: null, maxPhotos: 50 },
  { key: 'roses', label: 'Roses', description: null, maxPhotos: 50 },
  { key: 'arrangements', label: 'Arrangements', description: null, maxPhotos: 50 },
  { key: 'consumer_bunches', label: 'Consumer Bunches', description: null, maxPhotos: 50 },
  { key: 'bonus', label: 'Bonus — any in store activation from Elite, competitors or other categories', description: null, maxPhotos: 50 },
]

/** GoSpotCheck README §2.2: "Distance is gold and nobody's using it." Flag anything over half a mile. */
export const FAR_FROM_STORE_THRESHOLD_MILES = 0.5

/** productHint inferred from which section a structured price row was entered under. */
export const SECTION_PRODUCT_HINT: Record<string, string | null> = {
  entrance: null,
  floral_department: null,
  bouquets: 'bouquet',
  roses: 'rose',
  arrangements: 'arrangement',
  consumer_bunches: 'bunch',
  bonus: null,
}
