// breadcrumbs.ts — a small ring buffer of what the user did, so a crash report can
// show the trail of actions that led to it (navigations + clicks + key actions).
// Kept in memory only; read by the crash modal when something goes wrong.

export interface Breadcrumb {
  time: string // ISO 8601
  category: 'nav' | 'click' | 'action' | 'error'
  message: string
}

const MAX = 40
const buffer: Breadcrumb[] = []

export function addBreadcrumb(category: Breadcrumb['category'], message: string): void {
  buffer.push({ time: new Date().toISOString(), category, message: String(message).slice(0, 200) })
  if (buffer.length > MAX) buffer.shift()
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...buffer]
}

/** Capture clicks app-wide (label from the nearest button/link). Returns a cleanup fn. */
export function installBreadcrumbCapture(): () => void {
  const onClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null
    const el = target?.closest('button, a, [role="button"], [data-bc]') as HTMLElement | null
    if (!el) return
    const label =
      el.getAttribute('data-bc') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.textContent?.trim().slice(0, 60) ||
      el.tagName.toLowerCase()
    addBreadcrumb('click', label)
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
