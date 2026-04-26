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
