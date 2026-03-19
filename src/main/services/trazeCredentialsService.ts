/**
 * Traze Credentials Service — Main Process
 * =========================================
 * File path: src/main/services/trazeCredentialsService.ts
 *
 * Handles persistent storage of Traze credentials in userData.
 * Credentials are stored locally in a JSON file (not encrypted, local only).
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'traze-credentials.json');

export interface TrazeCredentials {
  email: string;
  password: string;
}

/**
 * Reads stored credentials from disk.
 * Returns null if no credentials exist or file is invalid.
 */
export function readCredentials(): TrazeCredentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as TrazeCredentials;
    
    // Validate structure
    if (!parsed.email || !parsed.password) {
      return null;
    }
    
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Saves credentials to disk.
 * Creates the directory if it doesn't exist.
 */
export function saveCredentials(email: string, password: string): void {
  const credentials: TrazeCredentials = {
    email: email.trim(),
    password: password.trim(),
  };
  
  const dir = path.dirname(CREDENTIALS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), 'utf-8');
}

/**
 * Checks if credentials exist on disk.
 */
export function hasCredentials(): boolean {
  return readCredentials() !== null;
}

/**
 * Deletes stored credentials.
 */
export function clearCredentials(): void {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch (err) {
    console.error('[TrazeCredentials] Failed to clear credentials:', err);
  }
}
