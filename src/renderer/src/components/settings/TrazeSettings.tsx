/**
 * TrazeSettings Component
 * ========================
 * File path: src/renderer/src/components/settings/TrazeSettings.tsx
 *
 * Settings tab for Traze integration.
 * Allows users to manage credentials, monitor download status, and view logs.
 */

import { useState } from 'react';
import { 
  Shield, 
  Save, 
  Play, 
  RotateCcw, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  CheckCircle,
  AlertCircle,
  Loader2,
  Terminal,
  Eye,
  EyeOff
} from 'lucide-react';
import { useTrazeSettings } from '../../hooks/useTrazeSettings';

export default function TrazeSettings() {
  const {
    email,
    password,
    setEmail,
    setPassword,
    hasSavedCredentials,
    savedEmail,
    preferences,
    setViewBrowser,
    status,
    statusMessage,
    isLoading,
    logs,
    saveCredentials,
    connect,
    clearLogs,
    clearStoredCredentials,
  } = useTrazeSettings();

  const [showLogs, setShowLogs] = useState(false);

  // Status indicator color and icon
  const getStatusDisplay = () => {
    switch (status) {
      case 'success':
        return {
          icon: <CheckCircle size={16} className="text-green-500" />,
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-700/40',
          textColor: 'text-green-700 dark:text-green-400',
        };
      case 'error':
        return {
          icon: <AlertCircle size={16} className="text-red-500" />,
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-700/40',
          textColor: 'text-red-700 dark:text-red-400',
        };
      case 'connecting':
      case 'downloading':
      case 'validating':
        return {
          icon: <Loader2 size={16} className="animate-spin text-amber-500" />,
          bgColor: 'bg-amber-50 dark:bg-amber-900/20',
          borderColor: 'border-amber-200 dark:border-amber-700/40',
          textColor: 'text-amber-700 dark:text-amber-400',
        };
      default:
        return {
          icon: <Shield size={16} className="text-gray-400" />,
          bgColor: 'bg-gray-50 dark:bg-gray-800',
          borderColor: 'border-gray-200 dark:border-gray-700',
          textColor: 'text-gray-600 dark:text-gray-400',
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  // Format timestamp for logs
  const formatLogTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Get log level color
  const getLogLevelColor = (level: 'info' | 'warn' | 'error') => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warn':
        return 'text-amber-600 dark:text-amber-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield size={18} className="text-green-500" />
          Traze Integration
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Connect to Traze to automatically fetch AWB tracking data. 
          Credentials are stored locally on your device.
        </p>
      </div>

      {/* Credentials Section */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          Credentials
          {hasSavedCredentials && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
              <CheckCircle size={12} />
              Saved
            </span>
          )}
        </h3>

        {hasSavedCredentials && savedEmail && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Stored email: <span className="font-mono text-gray-700 dark:text-gray-300">{savedEmail}</span>
          </div>
        )}

        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@eliteflower.com"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={saveCredentials}
            disabled={isLoading || !email.trim() || !password.trim()}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-green-700 dark:hover:bg-green-600"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save Credentials
          </button>

          {hasSavedCredentials && (
            <button
              onClick={clearStoredCredentials}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 size={16} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Advanced Options Section */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Advanced Options
        </h3>

        {/* View Browser Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            {preferences.viewBrowser ? (
              <Eye size={18} className="mt-0.5 text-green-500" />
            ) : (
              <EyeOff size={18} className="mt-0.5 text-gray-400" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                View Browser
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                When enabled, the browser window will be visible during the download process.
                When disabled, the process runs in the background.
              </p>
            </div>
          </div>
          
          {/* Toggle Switch */}
          <button
            onClick={() => setViewBrowser(!preferences.viewBrowser)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              preferences.viewBrowser
                ? 'bg-green-600'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                preferences.viewBrowser ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Connection Status Section */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Connection Status
        </h3>

        {/* Status Display */}
        <div className={`flex items-center gap-3 rounded-lg border p-3 ${statusDisplay.bgColor} ${statusDisplay.borderColor}`}>
          {statusDisplay.icon}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${statusDisplay.textColor}`}>
              {status === 'idle' ? 'Ready to connect' : statusMessage}
            </p>
            {(status === 'connecting' || status === 'downloading' || status === 'validating') && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                This may take up to 60 seconds...
              </p>
            )}
          </div>
        </div>

        {/* Connect Button */}
        <div className="flex gap-2">
          <button
            onClick={connect}
            disabled={isLoading || !hasSavedCredentials}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-green-700 dark:hover:bg-green-600"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            {isLoading ? 'Connecting...' : 'Connect & Download'}
          </button>

          {!hasSavedCredentials && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center">
              Save credentials first
            </p>
          )}
        </div>
      </div>

      {/* Logs Section */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center justify-between w-full p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Terminal size={16} className="text-gray-400" />
            Logs / Debug
          </h3>
          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {logs.length} entries
              </span>
            )}
            {showLogs ? (
              <ChevronUp size={16} className="text-gray-400" />
            ) : (
              <ChevronDown size={16} className="text-gray-400" />
            )}
          </div>
        </button>

        {showLogs && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {/* Log Actions */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Recent activity
              </span>
              <button
                onClick={clearLogs}
                disabled={logs.length === 0 || isLoading}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Clear
              </button>
            </div>

            {/* Log Entries */}
            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              {logs.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                  No logs yet. Run a connection to see activity.
                </p>
              ) : (
                logs.map((log, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 text-xs font-mono p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  >
                    <span className="text-gray-400 dark:text-gray-500 shrink-0">
                      {formatLogTime(log.timestamp)}
                    </span>
                    <span className={`uppercase text-[10px] px-1 rounded shrink-0 ${
                      log.level === 'error' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                      log.level === 'warn' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {log.level}
                    </span>
                    <span className={`break-all ${getLogLevelColor(log.level)}`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
        <p>
          <strong>About Traze integration:</strong> This feature automatically downloads 
          shipment data from Traze to update AWB tracking information in your tasks.
        </p>
        <p>
          The connection runs entirely on your device. Your credentials are stored locally 
          and never sent to any server other than Traze&apos;s official API.
        </p>
      </div>
    </div>
  );
}
