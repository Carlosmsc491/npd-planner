/**
 * useTrazeSettings Hook
 * ======================
 * File path: src/renderer/src/hooks/useTrazeSettings.ts
 *
 * React hook for managing Traze credentials, connection status, and logs.
 * Used by the TrazeSettings component.
 */

import { useState, useEffect, useCallback } from 'react';

export interface TrazeLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type TrazeStatus = 'idle' | 'connecting' | 'downloading' | 'validating' | 'success' | 'error';

interface TrazePreferences {
  viewBrowser: boolean;
}

interface UseTrazeSettingsReturn {
  // Credentials form state
  email: string;
  password: string;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  hasSavedCredentials: boolean;
  savedEmail: string | null;
  
  // Preferences
  preferences: TrazePreferences;
  setViewBrowser: (value: boolean) => Promise<void>;
  
  // Process status
  status: TrazeStatus;
  statusMessage: string;
  isLoading: boolean;
  
  // Logs
  logs: TrazeLog[];
  
  // Actions
  saveCredentials: () => Promise<void>;
  connect: () => Promise<void>;
  clearLogs: () => void;
  loadCredentials: () => Promise<void>;
  clearStoredCredentials: () => Promise<void>;
}

export function useTrazeSettings(): UseTrazeSettingsReturn {
  const api = window.electronAPI;
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  
  // Process status
  const [status, setStatus] = useState<TrazeStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('Ready');
  const [isLoading, setIsLoading] = useState(false);
  
  // Logs
  const [logs, setLogs] = useState<TrazeLog[]>([]);
  
  // Preferences
  const [preferences, setPreferences] = useState<TrazePreferences>({ viewBrowser: false });

  // Load preferences
  const loadPreferences = useCallback(async () => {
    if (!api?.invoke) return;
    
    try {
      const result = await api.invoke('traze:get-preferences') as TrazePreferences;
      setPreferences(result);
    } catch (err) {
      console.error('[useTrazeSettings] Failed to load preferences:', err);
    }
  }, [api]);

  // Set view browser preference
  const setViewBrowser = useCallback(async (value: boolean) => {
    if (!api?.invoke) return;
    
    try {
      const result = await api.invoke('traze:set-view-browser', value) as { 
        success: boolean; 
        error?: string;
      };
      
      if (result.success) {
        setPreferences(prev => ({ ...prev, viewBrowser: value }));
      }
    } catch (err) {
      console.error('[useTrazeSettings] Failed to set view browser:', err);
    }
  }, [api]);

  // Load initial credentials status
  const loadCredentials = useCallback(async () => {
    if (!api?.invoke) return;
    
    try {
      const result = await api.invoke('traze:load-credentials') as { 
        email: string | null; 
        hasCredentials: boolean;
      };
      setHasSavedCredentials(result.hasCredentials);
      setSavedEmail(result.email);
      if (result.email) {
        setEmail(result.email);
      }
    } catch (err) {
      console.error('[useTrazeSettings] Failed to load credentials:', err);
    }
  }, [api]);

  // Load initial data
  useEffect(() => {
    loadCredentials();
    loadPreferences();
    refreshStatus();
    refreshLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for process events
  useEffect(() => {
    if (!api?.on) return;

    const onDownloaded = () => {
      setStatus('success');
      setStatusMessage('Completed successfully');
      setIsLoading(false);
      refreshLogs();
    };

    const onError = (_event: unknown, payload: { message: string }) => {
      setStatus('error');
      setStatusMessage(`Failed: ${payload.message}`);
      setIsLoading(false);
      refreshLogs();
    };

    api.on('traze:csv-downloaded', onDownloaded as (...args: unknown[]) => void);
    api.on('traze:csv-error', onError as (...args: unknown[]) => void);

    return () => {
      api.off?.('traze:csv-downloaded', onDownloaded as (...args: unknown[]) => void);
      api.off?.('traze:csv-error', onError as (...args: unknown[]) => void);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // Refresh status from main process
  const refreshStatus = useCallback(async () => {
    if (!api?.invoke) return;
    
    try {
      const result = await api.invoke('traze:get-process-status') as { 
        status: TrazeStatus; 
        message: string;
      };
      setStatus(result.status);
      setStatusMessage(result.message);
    } catch (err) {
      console.error('[useTrazeSettings] Failed to refresh status:', err);
    }
  }, [api]);

  // Refresh logs from main process
  const refreshLogs = useCallback(async () => {
    if (!api?.invoke) return;
    
    try {
      const result = await api.invoke('traze:get-logs') as TrazeLog[];
      setLogs(result);
    } catch (err) {
      console.error('[useTrazeSettings] Failed to refresh logs:', err);
    }
  }, [api]);

  // Save credentials action
  const saveCredentials = useCallback(async () => {
    if (!api?.invoke) return;
    
    if (!email.trim() || !password.trim()) {
      setStatus('error');
      setStatusMessage('Email and password are required');
      return;
    }
    
    setIsLoading(true);
    try {
      const result = await api.invoke('traze:save-credentials', { email, password }) as { 
        success: boolean; 
        error?: string;
      };
      
      if (result.success) {
        setHasSavedCredentials(true);
        setSavedEmail(email);
        setStatus('success');
        setStatusMessage('Credentials saved successfully');
        setPassword(''); // Clear password from memory
      } else {
        setStatus('error');
        setStatusMessage(`Failed to save: ${result.error}`);
      }
    } catch (err) {
      setStatus('error');
      setStatusMessage(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
      refreshLogs();
    }
  }, [api, email, password, refreshLogs]);

  // Connect action (trigger download)
  const connect = useCallback(async () => {
    if (!api?.invoke) return;
    
    // Check if credentials exist
    const credsCheck = await api.invoke('traze:has-credentials') as { hasCredentials: boolean };
    if (!credsCheck.hasCredentials) {
      setStatus('error');
      setStatusMessage('No credentials saved. Please save credentials first.');
      return;
    }
    
    setIsLoading(true);
    setStatus('connecting');
    setStatusMessage('Opening browser...');
    
    try {
      // Start the download process
      const result = await api.invoke('traze:refresh-csv') as {
        usedCache: boolean;
        message: string;
        error?: boolean;
        csvStatus?: {
          exists: boolean;
          filePath: string | null;
          downloadedAt: string | null;
          sizeKb: number | null;
        };
      };
      
      if (result.error) {
        setStatus('error');
        setStatusMessage(result.message);
      } else if (result.usedCache) {
        setStatus('success');
        setStatusMessage(result.message);
      } else {
        setStatus('success');
        setStatusMessage('Download completed successfully');
      }
    } catch (err) {
      setStatus('error');
      setStatusMessage(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
      refreshLogs();
    }
  }, [api, refreshLogs]);

  // Clear logs action
  const clearLogs = useCallback(async () => {
    if (!api?.invoke) return;
    
    try {
      await api.invoke('traze:clear-logs');
      setLogs([]);
    } catch (err) {
      console.error('[useTrazeSettings] Failed to clear logs:', err);
    }
  }, [api]);

  // Clear stored credentials
  const clearStoredCredentials = useCallback(async () => {
    if (!api?.invoke) return;
    
    try {
      await api.invoke('traze:clear-credentials');
      setHasSavedCredentials(false);
      setSavedEmail(null);
      setEmail('');
      setPassword('');
      setStatus('idle');
      setStatusMessage('Credentials cleared');
    } catch (err) {
      console.error('[useTrazeSettings] Failed to clear credentials:', err);
    }
  }, [api]);

  return {
    // Credentials
    email,
    password,
    setEmail,
    setPassword,
    hasSavedCredentials,
    savedEmail,
    
    // Preferences
    preferences,
    setViewBrowser,
    
    // Status
    status,
    statusMessage,
    isLoading,
    
    // Logs
    logs,
    
    // Actions
    saveCredentials,
    connect,
    clearLogs,
    loadCredentials,
    clearStoredCredentials,
  };
}
