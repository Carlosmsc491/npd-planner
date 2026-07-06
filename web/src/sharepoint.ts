// Online SharePoint base for NPD-PLANNER attachments.
// The desktop app stores only a path relative to this root (year/client/task/file);
// the cloud URL is identical for every user in the Elite Flower tenant, so we can
// reconstruct a direct link the web app can open.
//
// Derived from a real file URL:
//   https://eliteflowersasci.sharepoint.com/sites/US-SALES/NPD-SECURE/Documents/
//     REPORTS/NPD-PLANNER/2026/PUBLIX/PUBLIX - YELLOW FLOWERS/REPORT_....pdf
const SHAREPOINT_BASE =
  'https://eliteflowersasci.sharepoint.com/sites/US-SALES/NPD-SECURE/Documents/REPORTS/NPD-PLANNER'

/** Build a direct SharePoint Online URL from a stored relative attachment path. */
export function buildSharePointUrl(relativePath: string): string {
  const clean = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const encoded = clean.split('/').map(encodeURIComponent).join('/')
  return `${SHAREPOINT_BASE}/${encoded}`
}
