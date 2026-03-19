// src/shared/constants.ts
// Shared constants between main and renderer processes

export const ALLOWED_DOMAIN = 'eliteflower.com'
export const SHAREPOINT_VERIFICATION_FOLDER = 'REPORTS (NPD-SECURE)'
export const ARCHIVE_AFTER_MONTHS = 12
export const RETRY_INTERVAL_MS = 30_000
export const MAX_RETRY_COUNT = 5
export const APP_NAME = 'NPD Planner'
export const COMPANY_NAME = 'Elite Flower'

// IPC channel names
export const IPC = {
  FILE_COPY: 'file:copy',
  FILE_SELECT_FOLDER: 'file:selectFolder',
  FILE_SELECT: 'file:select',
  FILE_READ_BASE64: 'file:readBase64',
  FILE_EXISTS: 'file:exists',
  FILE_OPEN: 'file:open',
  SHAREPOINT_VERIFY: 'sharepoint:verify',
  SHAREPOINT_RESOLVE_PATH: 'sharepoint:resolvePath',
  NOTIFICATION_SEND: 'notification:send',
  NOTIFICATION_CLICKED: 'notification:clicked',
  APP_VERSION: 'app:version',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_DOWNLOADED: 'update:downloaded',
  OPEN_EXTERNAL: 'shell:openExternal',
} as const
