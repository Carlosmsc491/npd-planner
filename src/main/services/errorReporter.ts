import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'

interface ErrorReport {
  timestamp: string
  appVersion: string
  platform: string
  errorType: string
  errorMessage: string
  stackTrace?: string
  userDescription?: string
  logs: string[]
}

class ErrorReporter {
  private errorWindow: BrowserWindow | null = null
  private pendingError: ErrorReport | null = null
  private logBuffer: string[] = []
  private readonly maxLogs = 100

  constructor() {
    this.setupGlobalHandlers()
  }

  private setupGlobalHandlers() {
    // Catch unhandled errors in main process
    process.on('uncaughtException', (error) => {
      console.error('[ErrorReporter] Uncaught exception:', error)
      this.handleError('uncaughtException', error.message, error.stack)
    })

    process.on('unhandledRejection', (reason) => {
      console.error('[ErrorReporter] Unhandled rejection:', reason)
      const message = reason instanceof Error ? reason.message : String(reason)
      const stack = reason instanceof Error ? reason.stack : undefined
      this.handleError('unhandledRejection', message, stack)
    })
  }

  public log(message: string) {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${message}`
    this.logBuffer.push(logEntry)
    if (this.logBuffer.length > this.maxLogs) {
      this.logBuffer.shift()
    }
  }

  public handleError(type: string, message: string, stack?: string) {
    if (this.errorWindow) {
      // Already showing error window
      return
    }

    this.pendingError = {
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: `${process.platform} ${process.arch}`,
      errorType: type,
      errorMessage: message,
      stackTrace: stack,
      logs: [...this.logBuffer]
    }

    this.showErrorWindow()
  }

  private showErrorWindow() {
    const appPath = app.getAppPath()
    
    this.errorWindow = new BrowserWindow({
      width: 600,
      height: 700,
      resizable: false,
      maximizable: false,
      minimizable: false,
      parent: BrowserWindow.getAllWindows()[0],
      modal: true,
      show: false,
      webPreferences: {
        preload: join(appPath, 'out/preload/index.js'),
        contextIsolation: true,
        sandbox: false,
      },
    })

    // Load the error reporter HTML
    const htmlPath = join(appPath, 'out/renderer/error-reporter.html')
    this.errorWindow.loadFile(htmlPath).catch(() => {
      // Fallback: create HTML inline
      this.errorWindow?.loadURL(`data:text/html,${encodeURIComponent(this.getErrorHTML())}`)
    })

    this.errorWindow.once('ready-to-show', () => {
      this.errorWindow?.show()
      // Send error data to renderer
      this.errorWindow?.webContents.send('error-data', this.pendingError)
    })

    this.errorWindow.on('closed', () => {
      this.errorWindow = null
      this.pendingError = null
    })
  }

  private getErrorHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Error Report - NPD Planner</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f9fafb;
      color: #1f2937;
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 560px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .icon {
      width: 64px;
      height: 64px;
      background: #fee2e2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 32px;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      color: #dc2626;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #6b7280;
      font-size: 14px;
    }
    .error-box {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .error-label {
      font-size: 12px;
      font-weight: 500;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .error-message {
      font-family: monospace;
      font-size: 13px;
      color: #dc2626;
      word-break: break-word;
    }
    .description-area {
      width: 100%;
      min-height: 100px;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      resize: vertical;
      font-family: inherit;
    }
    .description-area:focus {
      outline: none;
      border-color: #1d9e75;
      ring: 2px solid rgba(29, 158, 117, 0.2);
    }
    .hint {
      font-size: 12px;
      color: #6b7280;
      margin-top: 6px;
    }
    .buttons {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    .btn {
      flex: 1;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #1d9e75;
      color: white;
    }
    .btn-primary:hover {
      background: #178860;
    }
    .btn-secondary {
      background: white;
      color: #374151;
      border: 1px solid #d1d5db;
    }
    .btn-secondary:hover {
      background: #f9fafb;
    }
    .footer {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">⚠️</div>
      <h1>An Error Occurred</h1>
      <p class="subtitle">We're sorry, but something went wrong with NPD Planner.</p>
    </div>

    <div class="error-box">
      <div class="error-label">Error</div>
      <div class="error-message" id="error-message">Loading...</div>
    </div>

    <div class="error-box">
      <div class="error-label">What were you doing?</div>
      <textarea 
        id="user-description" 
        class="description-area"
        placeholder="Please describe what you were doing before this error occurred. This will help us fix the issue faster."
      ></textarea>
      <p class="hint">Your description will be included in the error report.</p>
    </div>

    <div class="buttons">
      <button class="btn btn-secondary" onclick="closeWindow()">Close</button>
      <button class="btn btn-primary" onclick="sendReport()">Send Report</button>
    </div>

    <div class="footer">
      NPD Planner v${app.getVersion()} • Error reports help us improve the app
    </div>
  </div>

  <script>
    let errorData = null;

    window.electronAPI?.onErrorData?.((data) => {
      errorData = data;
      document.getElementById('error-message').textContent = data.errorMessage || 'Unknown error';
    });

    function closeWindow() {
      window.close();
    }

    async function sendReport() {
      const description = document.getElementById('user-description').value;
      
      if (!errorData) return;

      const report = {
        ...errorData,
        userDescription: description
      };

      try {
        await window.electronAPI?.sendErrorReport?.(report);
      } catch (e) {
        console.error('Failed to send report:', e);
      }
    }

    // Fallback if IPC not available
    if (!window.electronAPI) {
      document.getElementById('error-message').textContent = 'Error reporting service unavailable';
    }
  </script>
</body>
</html>`
  }

  public async generateReportFile(report: ErrorReport): Promise<string> {
    const reportDir = join(homedir(), '.npd-planner', 'reports')
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `error-report-${timestamp}.txt`
    const filepath = join(reportDir, filename)

    const content = `
========================================
NPD PLANNER ERROR REPORT
========================================

Generated: ${report.timestamp}
App Version: ${report.appVersion}
Platform: ${report.platform}

----------------------------------------
ERROR DETAILS
----------------------------------------
Type: ${report.errorType}
Message: ${report.errorMessage}

${report.stackTrace ? `Stack Trace:\n${report.stackTrace}\n` : ''}

----------------------------------------
USER DESCRIPTION
----------------------------------------
${report.userDescription || 'No description provided'}

----------------------------------------
RECENT LOGS
----------------------------------------
${report.logs.join('\n')}

========================================
END OF REPORT
========================================
`

    writeFileSync(filepath, content, 'utf-8')
    return filepath
  }

  public async openEmailWithReport(_reportPath: string, report: ErrorReport) {
    const subject = encodeURIComponent(`NPD Planner Error Report - v${report.appVersion}`)
    const body = encodeURIComponent(`
Hello NPD Planner Team,

I encountered an error while using the app and am sending this report to help improve the software.

Error: ${report.errorMessage}

${report.userDescription ? `What I was doing:\n${report.userDescription}\n` : ''}

The full error report is attached to this email.

Thank you!
`)

    const mailtoLink = `mailto:carlosmsc491@gmail.com?subject=${subject}&body=${body}`
    
    // Open email client
    await shell.openExternal(mailtoLink)
    
    // Also open the reports folder so user can attach the file
    const reportDir = join(homedir(), '.npd-planner', 'reports')
    shell.openPath(reportDir)
  }
}

export const errorReporter = new ErrorReporter()
