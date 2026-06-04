// photoUtils.ts — Path resolution helpers for captured/processed photos
//
// Stored photo paths come in two formats:
//   NEW (relative): "PICTURES/1. CAMERA/Valentine/filename.jpg"
//   LEGACY (absolute): "/Users/carlos/OneDrive/.../filename.jpg" or "C:\Users\..."
//
// Relative paths are portable — any user resolves them against their local project.rootPath.
// Absolute paths (legacy data) are used as-is for backward compatibility.

/**
 * Derive the OneDrive library root from the configured SharePoint path.
 *
 * The configured SP path points somewhere INSIDE the library, e.g.:
 *   Windows: C:\Users\carlos\OneDrive - Elite Flower\Documents - NPD-SECURE\REPORTS\NPD-PLANNER
 *   Mac:     /Users/carlos/Library/CloudStorage/OneDrive-SharedLibraries-EliteFlower/NPD-SECURE - Documents/REPORTS/NPD-PLANNER
 *
 * The library root is the folder right after the OneDrive mount segment, e.g.:
 *   Windows: C:\Users\carlos\OneDrive - Elite Flower\Documents - NPD-SECURE
 *   Mac:     /Users/carlos/Library/CloudStorage/OneDrive-SharedLibraries-EliteFlower/NPD-SECURE - Documents
 *
 * This is the base against which relativeRootPath is stored, so projects anywhere
 * in the library are portable across users and OS.
 */
export function getLibraryRoot(spPath: string): string {
  if (!spPath) return spPath
  const normalized = spPath.replace(/\\/g, '/')
  const parts = normalized.split('/')

  // Find the segment that contains "OneDrive" (matches both Windows and Mac variants)
  const oneDriveIdx = parts.findIndex(p => /onedrive/i.test(p))
  if (oneDriveIdx === -1) {
    // No OneDrive segment found — fall back to parent of SP path.
    // On Mac, this likely means the SharePoint path is not under a standard
    // CloudStorage/OneDrive-* mount. relativeRootPath resolution may be incorrect.
    if (window.process?.platform !== 'win32') {
      console.warn(
        '[photoUtils] getLibraryRoot: no OneDrive segment found in SP path. ' +
        'Using parent folder as fallback. relativeRootPath resolution may be incorrect. ' +
        'Expected path format: /Users/{user}/Library/CloudStorage/OneDrive-*/...',
        spPath
      )
    }
    return parts.slice(0, -1).join('/') || normalized
  }

  // Library root = OneDrive segment + 1 more (the library folder name)
  const libraryRootParts = parts.slice(0, oneDriveIdx + 2)
  return libraryRootParts.join('/')
}

/**
 * Compute relativeRootPath relative to the library root (not the SP subfolder).
 * Returns undefined if the path is not inside the library root.
 */
export function toLibraryRelativePath(absPath: string, spPath: string): string | undefined {
  const normalAbs = absPath.replace(/\\/g, '/')

  // Primary: derive library root from configured spPath and match prefix
  const libraryRoot = getLibraryRoot(spPath)
  if (libraryRoot) {
    const normalLib = libraryRoot.replace(/\\/g, '/').replace(/\/$/, '')
    if (normalAbs.startsWith(normalLib + '/')) {
      return normalAbs.slice(normalLib.length + 1)
    }
  }

  // Fallback: derive library root directly from absPath itself.
  // Handles cross-platform case where spPath is a Mac path but absPath is Windows (or vice versa).
  const libraryRootFromAbs = getLibraryRoot(normalAbs)
  if (libraryRootFromAbs) {
    const normalLib = libraryRootFromAbs.replace(/\\/g, '/').replace(/\/$/, '')
    if (normalAbs.startsWith(normalLib + '/')) {
      return normalAbs.slice(normalLib.length + 1)
    }
  }

  return undefined
}

/**
 * Resolve a relativeRootPath (relative to library root) back to an absolute path
 * using the current machine's configured SP path.
 */
export function fromLibraryRelativePath(relPath: string, spPath: string): string {
  const libraryRoot = getLibraryRoot(spPath)
  if (!libraryRoot) return relPath
  const normalLib = libraryRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return `${normalLib}/${relPath}`
}

/**
 * Format a relativeRootPath into a human-readable breadcrumb.
 * e.g. relativeRootPath="IFPA 2026", spPath=".../Documents - NPD-SECURE/..."
 *   → "NPD-SECURE / IFPA 2026"
 */
export function formatProjectLocation(relativeRootPath: string | undefined, spPath: string, fallbackAbsPath?: string): string {
  const libraryRoot = getLibraryRoot(spPath)
  const libraryName = libraryRoot
    ? libraryRoot.replace(/\\/g, '/').split('/').pop()?.replace(/^Documents\s*[-–]\s*/i, '') ?? ''
    : ''

  // Use relativeRootPath if available
  if (relativeRootPath) {
    const segments = relativeRootPath.replace(/\\/g, '/').split('/').filter(Boolean)
    return libraryName ? [libraryName, ...segments].join(' / ') : segments.join(' / ')
  }

  // Legacy: derive from absolute path via library root segment matching
  if (fallbackAbsPath && libraryRoot) {
    const normalLib = libraryRoot.replace(/\\/g, '/').replace(/\/$/, '')
    const normalAbs = fallbackAbsPath.replace(/\\/g, '/')
    if (normalAbs.startsWith(normalLib + '/')) {
      const rel = normalAbs.slice(normalLib.length + 1)
      const segments = rel.split('/').filter(Boolean)
      return libraryName ? [libraryName, ...segments].join(' / ') : segments.join(' / ')
    }
    // Segment-match fallback: find library name in absolute path
    const libSegment = normalLib.split('/').pop() ?? ''
    const absIdx = normalAbs.indexOf(libSegment)
    if (absIdx !== -1) {
      const rel = normalAbs.slice(absIdx + libSegment.length + 1)
      const segments = rel.split('/').filter(Boolean)
      return libraryName ? [libraryName, ...segments].join(' / ') : segments.join(' / ')
    }
    // Final fallback: just the last 2 segments of the absolute path
    const parts = normalAbs.split('/').filter(Boolean)
    return parts.slice(-2).join(' / ')
  }

  return ''
}

/** Resolve a stored photo path to a local absolute path.
 *  - If already absolute (legacy data): returned unchanged.
 *  - If relative (new format): joined with project.rootPath.
 */
export function resolvePhotoPath(storedPath: string, rootPath: string): string {
  if (!storedPath) return storedPath
  // Mac absolute: starts with /
  // Windows absolute: starts with drive letter e.g. C:\ or C:/
  if (storedPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(storedPath)) return storedPath
  const root = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
  return `${root}/${storedPath}`
}

/**
 * Resolve a project's rootPath to a local absolute path for the current user.
 * Handles cross-platform paths (e.g., a Windows path opened on Mac).
 *
 * Strategy:
 *  1. Relative path (no leading / or drive letter): join with sharePointPath.
 *  2. Absolute and already under the user's SharePoint root: return as-is.
 *  3. Legacy absolute from another OS: locate the SharePoint folder name inside
 *     the stored path and reconstruct using the local sharePointPath.
 *  4. Fallback: return the stored path unchanged.
 */
export function resolveProjectRootPath(storedPath: string, sharePointPath: string): string {
  if (!storedPath) return storedPath
  if (!sharePointPath) {
    console.warn('[resolveProjectRootPath] sharePointPath is empty — user SP not configured. storedPath:', storedPath)
    return storedPath
  }

  const normalStored = storedPath.replace(/\\/g, '/')
  const normalSP     = sharePointPath.replace(/\\/g, '/').replace(/\/$/, '')

  // 1. Relative path (new format) — resolve against library root, not SP subfolder
  if (!normalStored.startsWith('/') && !/^[A-Za-z]:/.test(normalStored)) {
    return fromLibraryRelativePath(storedPath, sharePointPath)
  }

  // 2. Already under this machine's SharePoint root
  if (normalStored.startsWith(normalSP + '/') || normalStored === normalSP) {
    return storedPath
  }

  // 3. Find deepest common folder segment between SP path and stored path.
  //    Works even when the project folder is above or beside the SP root.
  //    e.g. stored = ...elacymek/.../Documents - NPD-SECURE/TEST
  //         spPath = ...cmsalazar/.../Documents - NPD-SECURE/REPORTS/NPD-PLANNER
  //    → finds "Documents - NPD-SECURE", reconstructs as spRoot/TEST
  const storedParts = normalStored.split('/')
  const spParts     = normalSP.split('/')
  for (let spIdx = spParts.length - 1; spIdx >= 1; spIdx--) {
    const segment = spParts[spIdx]
    if (!segment) continue
    // Find this segment in the stored path (search from end)
    let stIdx = -1
    for (let i = storedParts.length - 1; i >= 0; i--) {
      if (storedParts[i] === segment) { stIdx = i; break }
    }
    if (stIdx !== -1) {
      const spBase     = spParts.slice(0, spIdx + 1).join('/')
      const storedTail = storedParts.slice(stIdx + 1).join('/')
      return storedTail ? `${spBase}/${storedTail}` : spBase
    }
  }

  // 4. Fallback — no common segment found
  console.warn('[resolveProjectRootPath] No common segment found.', { storedPath, sharePointPath })
  return storedPath
}

/** Convert an absolute path to a relative path by stripping the project root prefix.
 *  Used before writing paths to Firestore so other users can resolve them.
 *  If the path doesn't start with rootPath (already relative or mismatch), returned unchanged.
 */
export function toRelativePhotoPath(absPath: string, rootPath: string): string {
  if (!absPath) return absPath
  const normalRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '') + '/'
  const normalAbs  = absPath.replace(/\\/g, '/')
  if (normalAbs.startsWith(normalRoot)) return normalAbs.slice(normalRoot.length)
  return absPath // fallback — already relative or root mismatch
}
