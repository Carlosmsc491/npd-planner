/**
 * Traze Status Service — Main Process
 * ====================================
 * File path: src/main/services/trazeStatusService.ts
 *
 * Tracks the current status and logs of the Traze download process.
 * Logs are stored in memory only (not persisted) to avoid clutter.
 */

export type TrazeStatus = 'idle' | 'connecting' | 'downloading' | 'validating' | 'success' | 'error';

export interface TrazeLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface StatusState {
  status: TrazeStatus;
  message: string;
  logs: TrazeLog[];
}

// In-memory state (resets on app restart)
const state: StatusState = {
  status: 'idle',
  message: 'Ready',
  logs: [],
};

const MAX_LOGS = 100; // Prevent memory leaks

/**
 * Updates the current status and optionally adds a log entry.
 */
export function setStatus(status: TrazeStatus, message?: string): void {
  state.status = status;
  if (message) {
    state.message = message;
    addLog(message, status === 'error' ? 'error' : 'info');
  }
}

/**
 * Gets the current status and message.
 */
export function getStatus(): { status: TrazeStatus; message: string } {
  return {
    status: state.status,
    message: state.message,
  };
}

/**
 * Adds a log entry with timestamp.
 */
export function addLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const entry: TrazeLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  
  state.logs.push(entry);
  
  // Keep only last MAX_LOGS to prevent memory issues
  if (state.logs.length > MAX_LOGS) {
    state.logs = state.logs.slice(-MAX_LOGS);
  }
  
  // Also log to console for debugging
  const prefix = '[TrazeStatus]';
  if (level === 'error') {
    console.error(prefix, message);
  } else if (level === 'warn') {
    console.warn(prefix, message);
  } else {
    console.log(prefix, message);
  }
}

/**
 * Gets all stored logs.
 */
export function getLogs(): TrazeLog[] {
  return [...state.logs];
}

/**
 * Clears all logs.
 */
export function clearLogs(): void {
  state.logs = [];
}

/**
 * Resets status to idle.
 */
export function resetStatus(): void {
  state.status = 'idle';
  state.message = 'Ready';
}

/**
 * Updates status based on process duration (approximate step tracking).
 * Since we can't modify trazePlaywrightService, we use timing heuristics.
 */
let processStartTime: number | null = null;

export function markProcessStart(): void {
  processStartTime = Date.now();
  setStatus('connecting', 'Opening browser...');
}

export function updateStatusByElapsedTime(): void {
  if (!processStartTime) return;
  
  const elapsed = Date.now() - processStartTime;
  
  if (elapsed > 25000) {
    setStatus('downloading', 'Downloading CSV...');
  } else if (elapsed > 20000) {
    setStatus('downloading', 'Setting date filters...');
  } else if (elapsed > 15000) {
    setStatus('connecting', 'Navigating to export page...');
  } else if (elapsed > 10000) {
    setStatus('connecting', 'Selecting company...');
  } else if (elapsed > 5000) {
    setStatus('connecting', 'Signing in...');
  } else if (elapsed > 2000) {
    setStatus('connecting', 'Loading Traze login page...');
  }
}

export function markProcessComplete(success: boolean, message?: string): void {
  processStartTime = null;
  if (success) {
    setStatus('success', message || 'Completed successfully');
  } else {
    setStatus('error', message || 'Failed');
  }
}

export function markProcessValidating(): void {
  setStatus('validating', 'Validating downloaded file...');
}
