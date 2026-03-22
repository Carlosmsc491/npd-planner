# NPD Planner — Engineering Audit Report
**Date:** 2026-03-20  
**Auditor:** Kimi Code CLI  
**Scope:** Full codebase audit for technical debt, security risks, bugs, and production readiness  
**App Version:** 1.0.4

---

## Executive Summary

NPD Planner is a well-architected Electron + React application with Firebase Firestore backend. The codebase demonstrates good TypeScript discipline, clean separation of concerns, and thoughtful UI/UX patterns. However, there are **several critical security and reliability issues** that must be addressed before production deployment, primarily around:

1. **Plaintext credential storage** for Traze integration
2. **Missing input validation** in IPC handlers creating potential security vulnerabilities
3. **Race conditions** in file upload retry logic
4. **Incomplete error handling** in browser automation
5. **Path traversal risks** in file deletion operations

**Overall Risk Assessment:** MEDIUM-HIGH — The app is functional but has security gaps that could lead to credential exposure or local file system compromise.

---

## 1. Confirmed Critical Issues

### CRITICAL-1: Traze Credentials Stored in Plaintext JSON
**Severity:** CRITICAL  
**Category:** Security / Credential Storage  
**Files:** 
- `src/main/services/trazeCredentialsService.ts` (lines 14, 29-39, 48-59)
- `src/main/services/trazePlaywrightService.ts` (lines 24, 31-40)

**Explanation:**
Traze credentials (email/password) are stored in a JSON file at `{userData}/traze-credentials.json` with NO encryption. The file contains:
```json
{
  "email": "user@eliteflower.com",
  "password": "plaintext_password"
}
```

**Risk:**
- Any process running as the user can read these credentials
- Malware can easily harvest credentials
- Credentials visible in file system backups
- Violates security best practices for credential storage

**Evidence:**
```typescript
// trazeCredentialsService.ts:14
const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'traze-credentials.json');

// trazeCredentialsService.ts:48-59
export function saveCredentials(email: string, password: string): void {
  const credentials: TrazeCredentials = {
    email: email.trim(),
    password: password.trim(),  // STORED IN PLAINTEXT
  };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), 'utf-8');
}
```

**Reproduction:**
1. Open NPD Planner
2. Go to Settings → Traze Integration
3. Save credentials
4. Navigate to `%APPDATA%\npd-planner\traze-credentials.json` on Windows or `~/Library/Application Support/npd-planner/traze-credentials.json` on Mac
5. Open file — credentials are visible in plaintext

**Minimal Safe Fix:**
Use Electron's `safeStorage` API (available in Electron 15+) to encrypt credentials:
```typescript
import { safeStorage } from 'electron';

export function saveCredentials(email: string, password: string): void {
  const encrypted = safeStorage.encryptString(password);
  const credentials = {
    email,
    password: encrypted.toString('base64'),
  };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials));
}
```

**Confidence:** 100% — Confirmed by direct code inspection

---

### CRITICAL-2: Path Traversal Vulnerability in Trash Cleanup
**Severity:** CRITICAL  
**Category:** Security / Local File System  
**Files:**
- `src/main/services/trashCleanupService.ts` (lines 92-118, 156-172)

**Explanation:**
The `deleteTrashItem` and `deleteFolderImmediately` functions perform a weak path validation that can be bypassed:
```typescript
// Line 97
if (!folderPath.includes('REPORTS (NPD-SECURE)')) {
  console.error(`[TrashCleanup] Invalid path rejected: ${folderPath}`)
  return
}
```

This check is insufficient. A malicious path like `../../../REPORTS (NPD-SECURE)/../../sensitive-folder` would pass the check and allow deletion outside the intended directory.

**Risk:**
- Potential deletion of arbitrary files on the system
- Could delete critical system files if path traversal is exploited
- Data loss beyond the intended trash cleanup scope

**Evidence:**
```typescript
// Lines 156-172
export async function deleteFolderImmediately(folderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Safety check - EASILY BYPASSED
    if (!folderPath.includes('REPORTS (NPD-SECURE)')) {
      return { success: false, error: 'Invalid path' }
    }
    await fs.promises.rm(folderPath, { recursive: true, force: true })
    return { success: true }
  }
}
```

**Reproduction:**
This vulnerability requires manipulation of the `sharePointFolderPath` stored in Firestore trash queue documents, which would require Firestore write access. However, if an attacker gains write access to Firestore, they could exploit this.

**Minimal Safe Fix:**
```typescript
import { normalize, resolve } from 'path';

function isValidTrashPath(targetPath: string, sharePointRoot: string): boolean {
  const normalizedTarget = normalize(targetPath);
  const normalizedRoot = normalize(sharePointRoot);
  const resolvedTarget = resolve(normalizedTarget);
  const resolvedRoot = resolve(normalizedRoot);
  
  // Ensure target is within SharePoint root AND contains verification folder
  return resolvedTarget.startsWith(resolvedRoot) && 
         resolvedTarget.includes('REPORTS (NPD-SECURE)');
}
```

**Confidence:** 100% — Confirmed by direct code inspection

---

### CRITICAL-3: No Input Validation on IPC File Operations
**Severity:** HIGH  
**Category:** Security / IPC  
**Files:**
- `src/main/ipc/fileHandlers.ts` (lines 19-35, 97-103, 149-165)

**Explanation:**
The file copy and save operations accept paths from the renderer without validation:
```typescript
ipcMain.handle(IPC.FILE_COPY, async (_event, req: IpcFileRequest): Promise<IpcFileResponse> => {
  const segments = req.destPath.split('|||')
  const destPath = path.join(...segments)  // NO VALIDATION
  fs.copyFileSync(req.sourcePath, destPath)  // Could write anywhere
})
```

While the `|||` delimiter provides some protection, there's no validation that:
1. The source path is within expected directories
2. The destination is within the SharePoint folder
3. Paths don't contain traversal sequences

**Risk:**
- Potential arbitrary file write if renderer is compromised
- Could overwrite system files
- Could exfiltrate sensitive files by copying them to known locations

**Minimal Safe Fix:**
Add path validation middleware:
```typescript
function validateSharePointPath(targetPath: string, sharePointRoot: string): boolean {
  const resolved = path.resolve(targetPath);
  const resolvedRoot = path.resolve(sharePointRoot);
  return resolved.startsWith(resolvedRoot);
}
```

**Confidence:** 95% — The `|||` delimiter provides some protection, but direct path segments could still include traversal

---

## 2. Suspected Risks

### SUSPECTED-1: Playwright Browser Automation Reliability
**Severity:** HIGH  
**Category:** Reliability / Browser Automation  
**Files:**
- `src/main/services/trazePlaywrightService.ts` (full file)

**Explanation:**
The Traze CSV download relies on Playwright browser automation with hardcoded selectors and fixed timeouts. The code makes several assumptions about the Traze website structure:
- Line 61-63: Hardcoded form input selectors
- Line 66: Assumes "Elite" company is first in list
- Line 100-108: Relies on placeholder text for date inputs
- Line 111-112: Clicks button by index (`allButtons[3]`)
- Line 125-152: Complex DOM manipulation for column toggles

**Risk:**
- Any change to Traze website will break the automation
- No retry mechanism for transient failures
- No graceful degradation if download fails
- Could leave browser processes running if killed mid-operation

**Evidence:**
```typescript
// Line 112 - Brittle button selection
const allButtons = await page.$$('button');
await allButtons[3].click();  // Assumes 4th button is always Refresh

// Line 98 - Fixed timeout that may not be sufficient on slow connections
await page.waitForTimeout(2500);
```

**Confidence:** 85% — Browser automation is inherently fragile

---

### SUSPECTED-2: CSV Parsing May Fail on Edge Cases
**Severity:** MEDIUM  
**Category:** Data Integrity  
**Files:**
- `src/renderer/src/utils/awbUtils.ts` (lines 89-148)

**Explanation:**
The CSV parser uses a simple state machine that may not handle all CSV edge cases:
- Double quotes inside quoted fields (`"He said ""hello"""`)
- Newlines within quoted fields
- Different line endings (CRLF vs LF)
- Malformed CSV from Traze export

**Risk:**
- AWB lookup failures if CSV format changes
- Incorrect data parsing leading to missed ETA updates
- App crashes on unexpected CSV structure

**Evidence:**
```typescript
// Lines 131-148 - Simple parser that doesn't handle escaped quotes
function parseCsvLine(line: string): string[] {
  // Doesn't handle: "field with ""quotes"" inside"
}
```

**Confidence:** 70% — Would need test data to confirm

---

### SUSPECTED-3: Memory Leak in Retry Queue
**Severity:** MEDIUM  
**Category:** Performance / Memory  
**Files:**
- `src/renderer/src/lib/sharepointLocal.ts` (lines 99-147)
- `src/renderer/src/hooks/useSharePoint.ts` (lines 45-69, 90-94)

**Explanation:**
The retry queue is module-level state that persists for the app lifetime. Failed uploads are retried up to 5 times, but:
1. There's no cleanup of old failed jobs
2. The queue could grow unbounded if many uploads fail
3. Two separate retry mechanisms exist (one in sharepointLocal.ts, one in useSharePoint.ts)

**Risk:**
- Memory growth over long app sessions
- Potential memory exhaustion if many files fail to upload

**Confidence:** 75% — Code review suggests potential issue

---

## 3. Technical Debt

### DEBT-1: Mixed Spanish/English in Comments and Logs
**Severity:** LOW  
**Category:** Maintainability  
**Files:**
- `src/main/services/trazeIntegrationService.ts` (multiple lines)
- `src/main/services/trazePlaywrightService.ts` (multiple lines)

**Example:**
```typescript
console.log('[TrazeIntegration] Dentro de horario — descargando al abrir app');
console.log('[TrazeIntegration] Fuera de horario — esperando próxima ventana');
```

**Impact:** Inconsistent codebase makes maintenance harder for international teams

**Fix:** Standardize on English for all code comments and log messages

---

### DEBT-2: Duplicate Retry Queue Implementation
**Severity:** MEDIUM  
**Category:** Code Organization  
**Files:**
- `src/renderer/src/lib/sharepointLocal.ts` (lines 99-147)
- `src/renderer/src/hooks/useSharePoint.ts` (lines 14-69)

**Explanation:**
Two separate retry queue implementations exist with similar logic but different behaviors. This creates maintenance burden and potential for inconsistent behavior.

**Fix:** Consolidate into a single retry service

---

### DEBT-3: Unused Imports and Dead Code
**Severity:** LOW  
**Category:** Code Quality  
**Files:**
- `src/renderer/src/hooks/useAwbLookup.ts` (line 217: `void nanoid;`)
- Various components have unused imports

**Fix:** Enable stricter ESLint rules for unused variables/imports

---

### DEBT-4: Direct Firestore Collection Name Strings
**Severity:** LOW  
**Category:** Maintainability  
**Files:**
- `src/renderer/src/hooks/useTrazeRefresh.ts` (line 160: `doc(db, 'tasks', taskId)`)

**Explanation:**
Some places use hardcoded collection names instead of the `COLLECTIONS` constant from firestore.ts

**Fix:** Use `COLLECTIONS.TASKS` consistently

---

## 4. Incomplete Features

### INCOMPLETE-1: Desktop Notifications Not Fully Implemented
**Severity:** MEDIUM  
**Category:** Feature Completion  
**Files:**
- `src/main/ipc/notificationHandlers.ts` (not shown in audit, but referenced)
- CLAUDE.md lines 594-599 show notifications as incomplete

**Evidence from CLAUDE.md:**
```markdown
### Phase 7 — Notifications & UX
- [ ] Desktop notifications (Electron Notification API) — Planner only
- [ ] Sound on notification
- [x] DND schedule respected (no sound/popup during DND hours)
- [ ] Notification bell with unread badge
- [ ] Notification center (dropdown from bell)
```

---

### INCOMPLETE-2: Analytics Dashboard Not Implemented
**Severity:** MEDIUM  
**Category:** Feature Completion  
**Evidence from CLAUDE.md:**
```markdown
### Phase 8 — Analytics & Build
- [ ] Analytics dashboard (admin only): tasks/week, load by person, top clients
- [ ] Annual archive: auto-detect tasks > 12 months old on startup
```

---

### INCOMPLETE-3: PDF Preview Has Limited Error Handling
**Severity:** LOW  
**Category:** Feature Completion  
**Files:**
- `src/renderer/src/components/task/AttachmentPanel.tsx` (lines 125-244)

The PDF preview component shows a generic error message but doesn't handle:
- Password-protected PDFs
- Corrupted PDF files
- Very large PDFs that could cause memory issues

---

## 5. Security Findings

### SEC-1: No Rate Limiting on Login Attempts
**Severity:** MEDIUM  
**Category:** Security / Authentication  
**Files:**
- `src/renderer/src/pages/LoginPage.tsx` (lines 87-162)

Firebase Auth has built-in rate limiting, but the app doesn't implement additional UI-level rate limiting or CAPTCHA after failed attempts.

**Risk:** Brute force attacks possible (though mitigated by Firebase)

---

### SEC-2: Emergency Access Key Hash Verification
**Severity:** LOW  
**Category:** Security / Authentication  
**Files:**
- `src/renderer/src/lib/firestore.ts` (lines 901-914)

The emergency key verification uses SHA-256 which is fast and could be brute-forced. Consider using a slower hash like bcrypt.

**Current:**
```typescript
const inputHash = await hashSHA256(inputKey)
return inputHash === masterKeyHash
```

---

### SEC-3: Firebase Config Exposed to Renderer
**Severity:** LOW  
**Category:** Security / Configuration  
**Files:**
- `src/renderer/src/lib/firebase.ts` (lines 18-25)

Firebase API keys are exposed in the renderer process. This is standard practice for Firebase client-side apps, but the API key should have strict usage restrictions in the Firebase console.

**Recommendation:** Ensure Firebase API key has HTTP referer restrictions and no unnecessary API access enabled.

---

## 6. Bug and Crash Findings

### BUG-1: Global Shortcut Not Re-registered on Window Recreation (Mac)
**Severity:** MEDIUM  
**Category:** Bug / Platform-Specific  
**Files:**
- `src/main/index.ts` (lines 108-117)

On macOS, when all windows are closed and a new window is created, the global shortcut is re-registered. However, this creates duplicate registrations if the window is recreated multiple times.

**Fix:** Unregister before registering:
```typescript
globalShortcut.unregister('CommandOrControl+Shift+R');
globalShortcut.register('CommandOrControl+Shift+R', () => { ... });
```

---

### BUG-2: Trash Cleanup Service Incomplete Implementation
**Severity:** MEDIUM  
**Category:** Bug / Incomplete Feature  
**Files:**
- `src/main/services/trashCleanupService.ts` (lines 72-86)

The `getTrashItemsDueForDeletion` function returns stale data:
```typescript
async function getTrashItemsDueForDeletion(): Promise<TrashItem[]> {
  return new Promise((resolve) => {
    resolve(pendingTrashItems)
    pendingTrashItems = [] // Clear after reading
  })
}
```

This implementation is incomplete — it doesn't actually fetch from Firestore. The comment says "renderer will call setPendingTrashItems" but there's no evidence this actually happens.

---

### BUG-3: Error Reporter Window May Fail to Load
**Severity:** LOW  
**Category:** Bug / Error Handling  
**Files:**
- `src/main/services/errorReporter.ts` (lines 89-94)

The error reporter tries to load an HTML file that may not exist:
```typescript
const htmlPath = join(appPath, 'out/renderer/error-reporter.html')
this.errorWindow.loadFile(htmlPath).catch(() => {
  // Fallback to inline HTML
})
```

There's no guarantee the fallback HTML is complete or functional.

---

## 7. Build and Packaging Risks

### BUILD-1: Electron Version Outdated
**Severity:** MEDIUM  
**Category:** Build / Security  
**Files:**
- `package.json` (line 54: `"electron": "^25.9.8"`)

Electron 25 is from mid-2023 and no longer receives security updates. Current stable is Electron 35+.

**Risk:** Security vulnerabilities in Chromium and Node.js won't be patched

**Fix:** Upgrade to Electron 33+ (maintained LTS versions)

---

### BUILD-2: Playwright Listed as Dependency (Not DevDependency)
**Severity:** LOW  
**Category:** Build / Bundle Size  
**Files:**
- `package.json` (line 37: `"playwright": "^1.58.2"`)

Playwright is a large package (~200MB) and is only used in the main process for Traze automation. It's correctly listed as a dependency (needed at runtime), but this significantly increases the packaged app size.

**Note:** This is unavoidable given the current architecture, but worth noting for distribution.

---

### BUILD-3: No Code Signing Configuration
**Severity:** MEDIUM  
**Category:** Build / Distribution  
**Files:**
- `electron-builder.yml` (no code signing config)

The app is not configured for code signing. This will cause:
- Windows SmartScreen warnings
- macOS "untrusted developer" warnings
- Anti-virus false positives

**Fix:** Add code signing certificates to build configuration

---

## 8. Quick Wins (Low Effort, High Impact)

| Issue | File | Fix |
|-------|------|-----|
| Add `rel="noopener noreferrer"` to external links | Any file with `openExternal` | Security best practice |
| Remove console.log in production | All files | Use proper logger with level filtering |
| Add loading state for attachment removal | AttachmentPanel.tsx | UI improvement |
| Standardize on English logs | traze*.ts files | Maintainability |
| Add `try/catch` around `openFile` | AttachmentPanel.tsx | Handle missing files gracefully |

---

## 9. Recommended Fix Order by Priority

### Immediate (Before Production)
1. **CRITICAL-1:** Encrypt Traze credentials using `safeStorage`
2. **CRITICAL-2:** Fix path traversal vulnerability in trash cleanup
3. **CRITICAL-3:** Add input validation to IPC file handlers
4. **BUILD-1:** Upgrade Electron to maintained LTS version

### Short-term (Next 2 weeks)
5. **SUSPECTED-1:** Add retry logic and error handling to Playwright automation
6. **BUG-1:** Fix global shortcut registration leak
7. **BUG-2:** Complete trash cleanup service implementation
8. **DEBT-2:** Consolidate duplicate retry queue implementations

### Medium-term (Next month)
9. **SUSPECTED-2:** Improve CSV parsing robustness
10. **SUSPECTED-3:** Add retry queue size limits and cleanup
11. **SEC-1:** Add UI-level rate limiting for login
12. **BUILD-3:** Implement code signing

### Long-term
13. Complete incomplete features (notifications, analytics)
14. Add comprehensive E2E tests for critical paths
15. Implement proper logging infrastructure

---

## Appendix: File Locations Summary

| File | Purpose | Lines |
|------|---------|-------|
| `src/main/index.ts` | Main entry, window creation | 140 |
| `src/main/ipc/fileHandlers.ts` | File system IPC handlers | 166 |
| `src/main/ipc/awbIpcHandlers.ts` | AWB/Traze IPC handlers | 240 |
| `src/main/services/trazeCredentialsService.ts` | Credential storage | 80 |
| `src/main/services/trazePlaywrightService.ts` | Browser automation | 210 |
| `src/main/services/trashCleanupService.ts` | Trash cleanup | 184 |
| `src/renderer/src/lib/sharepointLocal.ts` | SharePoint operations | 149 |
| `src/renderer/src/lib/firestore.ts` | Firestore operations | 1000+ |
| `src/renderer/src/hooks/useSharePoint.ts` | SharePoint hook | 219 |
| `src/renderer/src/hooks/useTrazeRefresh.ts` | Traze refresh hook | 190 |
| `src/renderer/src/utils/awbUtils.ts` | CSV parsing | 167 |

---

## Conclusion

NPD Planner is a well-built application with solid architecture and good coding practices. The critical issues identified are all addressable and primarily relate to:

1. **Security hardening** for credential storage and file system access
2. **Reliability improvements** for browser automation
3. **Completing partially implemented features**

With the recommended fixes applied, this application should be production-ready for Elite Flower's internal use.

---

*Report generated by Kimi Code CLI*  
*For questions or clarifications, please review the evidence sections and code references*
