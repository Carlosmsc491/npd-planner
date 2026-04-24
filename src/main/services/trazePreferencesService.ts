/**
 * Traze Preferences Service — Main Process
 * =========================================
 * File path: src/main/services/trazePreferencesService.ts
 *
 * Handles user preferences for Traze integration (not credentials).
 * Stored separately from credentials in userData.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

function getPreferencesFile(): string {
  return path.join(app.getPath('userData'), 'traze-preferences.json');
}

export interface TrazePreferences {
  /** If true, shows the browser window during automation (headless: false) */
  viewBrowser: boolean;
}

const DEFAULT_PREFERENCES: TrazePreferences = {
  viewBrowser: false, // Default: hidden browser for cleaner UX
};

/**
 * Reads stored preferences from disk.
 * Returns defaults if no preferences exist or file is invalid.
 */
export function readPreferences(): TrazePreferences {
  try {
    const PREFERENCES_FILE = getPreferencesFile();
    if (!fs.existsSync(PREFERENCES_FILE)) {
      return { ...DEFAULT_PREFERENCES };
    }
    const raw = fs.readFileSync(PREFERENCES_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TrazePreferences>;
    
    return {
      viewBrowser: parsed.viewBrowser ?? DEFAULT_PREFERENCES.viewBrowser,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Saves preferences to disk.
 */
export function savePreferences(preferences: TrazePreferences): void {
  const PREFERENCES_FILE = getPreferencesFile();
  const dir = path.dirname(PREFERENCES_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2), 'utf-8');
}

/**
 * Updates a single preference value.
 */
export function updatePreference<K extends keyof TrazePreferences>(
  key: K,
  value: TrazePreferences[K]
): void {
  const current = readPreferences();
  current[key] = value;
  savePreferences(current);
}

/**
 * Gets the current value of viewBrowser preference.
 */
export function getViewBrowser(): boolean {
  return readPreferences().viewBrowser;
}
