// photoUtils.ts — Path resolution helpers for captured/processed photos
//
// Stored photo paths come in two formats:
//   NEW (relative): "PICTURES/1. CAMERA/Valentine/filename.jpg"
//   LEGACY (absolute): "/Users/carlos/OneDrive/.../filename.jpg" or "C:\Users\..."
//
// Relative paths are portable — any user resolves them against their local project.rootPath.
// Absolute paths (legacy data) are used as-is for backward compatibility.

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
  if (!sharePointPath) return storedPath

  const normalStored = storedPath.replace(/\\/g, '/')
  const normalSP     = sharePointPath.replace(/\\/g, '/').replace(/\/$/, '')

  // 1. Relative path (new format)
  if (!normalStored.startsWith('/') && !/^[A-Za-z]:/.test(normalStored)) {
    return `${normalSP}/${normalStored}`
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

  // 4. Fallback
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
