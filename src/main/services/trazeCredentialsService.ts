/**
 * Traze Credentials Service — Main Process
 * =========================================
 * Credentials are stored in userData, encrypted with Electron safeStorage
 * (Windows DPAPI / macOS Keychain / Linux libsecret).
 * The file on disk contains the email in plain text and the password as a
 * Base64-encoded encrypted buffer — never as a readable string.
 */

import * as fs from 'fs'
import * as path from 'path'
import { app, safeStorage } from 'electron'

const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'traze-credentials.enc.json')

interface StoredCredentials {
  email: string
  passwordEnc: string  // Base64 of safeStorage.encryptString() buffer
}

export interface TrazeCredentials {
  email: string
  password: string
}

/**
 * Returns true if safeStorage encryption is available on this platform.
 * Falls back to a warning if the OS keychain is unavailable (e.g. headless CI).
 */
function canEncrypt(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/**
 * Reads and decrypts stored credentials.
 * Returns null if no credentials exist, file is invalid, or decryption fails.
 */
export function readCredentials(): TrazeCredentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null

    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8')
    const stored = JSON.parse(raw) as StoredCredentials

    if (!stored.email || !stored.passwordEnc) return null

    if (!canEncrypt()) {
      console.warn('[TrazeCredentials] safeStorage unavailable — cannot decrypt credentials')
      return null
    }

    const encBuf = Buffer.from(stored.passwordEnc, 'base64')
    const password = safeStorage.decryptString(encBuf)

    return { email: stored.email, password }
  } catch {
    return null
  }
}

/**
 * Encrypts and saves credentials to disk.
 */
export function saveCredentials(email: string, password: string): void {
  if (!canEncrypt()) {
    throw new Error('Encryption is not available on this platform. Cannot save credentials securely.')
  }

  const encBuf = safeStorage.encryptString(password.trim())
  const stored: StoredCredentials = {
    email: email.trim(),
    passwordEnc: encBuf.toString('base64'),
  }

  const dir = path.dirname(CREDENTIALS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(stored, null, 2), 'utf-8')

  // Remove any legacy plain-text credentials file if it exists
  const legacyFile = path.join(app.getPath('userData'), 'traze-credentials.json')
  if (fs.existsSync(legacyFile)) {
    try { fs.unlinkSync(legacyFile) } catch { /* ignore */ }
  }
}

/**
 * Checks if encrypted credentials exist on disk.
 */
export function hasCredentials(): boolean {
  return readCredentials() !== null
}

/**
 * Deletes stored credentials.
 */
export function clearCredentials(): void {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) fs.unlinkSync(CREDENTIALS_FILE)
    // Also clean up legacy file just in case
    const legacyFile = path.join(app.getPath('userData'), 'traze-credentials.json')
    if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile)
  } catch (err) {
    console.error('[TrazeCredentials] Failed to clear credentials:', err)
  }
}
