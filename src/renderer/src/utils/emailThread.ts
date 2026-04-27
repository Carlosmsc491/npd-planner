// src/renderer/src/utils/emailThread.ts
// Splits an email body (HTML or plain text) into individual thread messages.
// Handles Outlook (#divRplyFwdMsg), Gmail (blockquote), and plain-text separators.

export interface ThreadSegment {
  from: string
  date: string
  to: string
  bodyHtml: string | null
  bodyText: string
}

// ── HTML splitting ────────────────────────────────────────────────────────────

function innerText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function extractHeaderField(container: Element, label: string): string {
  // Find a child element whose text starts with the label (e.g. "From:", "Sent:")
  const all = Array.from(container.querySelectorAll('*'))
  for (const el of all) {
    const t = innerText(el)
    const re = new RegExp(`^${label}[:\\s]+(.+)$`, 'i')
    const m = t.match(re)
    if (m) return m[1].trim()
  }
  return ''
}

function elementToHtmlString(el: Element): string {
  const wrapper = document.createElement('div')
  wrapper.appendChild(el.cloneNode(true))
  return wrapper.innerHTML
}

function splitHtml(html: string, topFrom: string, topDate: string, topTo: string): ThreadSegment[] | null {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return null

  // ── Outlook: #divRplyFwdMsg ───────────────────────────────────────────────
  const replyDivs = Array.from(root.querySelectorAll('[id="divRplyFwdMsg"]'))
  if (replyDivs.length > 0) {
    const segments: ThreadSegment[] = []

    // Everything BEFORE the first reply div is the newest message
    const firstReply = replyDivs[0]
    const beforeNodes: Node[] = []
    let node: Node | null = root.firstChild
    while (node && node !== firstReply) {
      beforeNodes.push(node.cloneNode(true))
      node = node.nextSibling
    }
    const topWrapper = document.createElement('div')
    beforeNodes.forEach(n => topWrapper.appendChild(n))
    segments.push({ from: topFrom, date: topDate, to: topTo, bodyHtml: topWrapper.innerHTML, bodyText: topWrapper.textContent ?? '' })

    // Each reply div is one previous message
    for (const div of replyDivs) {
      // Look for the header info div (usually first child with bold fields)
      const hdrDiv = div.querySelector('[id="divHdrMsg"], [id="x_divHdrMsg"], table') ?? div.firstElementChild
      let from = '', date = '', to = ''
      if (hdrDiv) {
        from = extractHeaderField(hdrDiv, 'From') || extractHeaderField(hdrDiv, 'De')
        date = extractHeaderField(hdrDiv, 'Sent') || extractHeaderField(hdrDiv, 'Date') || extractHeaderField(hdrDiv, 'Fecha')
        to   = extractHeaderField(hdrDiv, 'To')   || extractHeaderField(hdrDiv, 'Para')
      }
      // Remove the hr and header, keep just the body
      const clone = div.cloneNode(true) as Element
      clone.querySelectorAll('hr').forEach(hr => hr.remove())
      if (hdrDiv) {
        const hdrClone = clone.querySelector('[id="divHdrMsg"], [id="x_divHdrMsg"], table') ?? clone.firstElementChild
        hdrClone?.remove()
      }
      segments.push({ from, date, to, bodyHtml: clone.innerHTML, bodyText: clone.textContent ?? '' })
    }

    return segments.length > 1 ? segments : null
  }

  // ── Gmail / generic: top-level <blockquote> ───────────────────────────────
  const topBlockquotes = Array.from(root.children).filter(c => c.tagName === 'BLOCKQUOTE')
  if (topBlockquotes.length > 0) {
    const segments: ThreadSegment[] = []
    const beforeNodes: Node[] = []
    let node: ChildNode | null = root.firstChild
    while (node) {
      if (node.nodeType === 1 && (node as Element).tagName === 'BLOCKQUOTE') break
      beforeNodes.push(node.cloneNode(true))
      node = node.nextSibling
    }
    const topWrapper = document.createElement('div')
    beforeNodes.forEach(n => topWrapper.appendChild(n))
    segments.push({ from: topFrom, date: topDate, to: topTo, bodyHtml: topWrapper.innerHTML, bodyText: topWrapper.textContent ?? '' })

    for (const bq of topBlockquotes) {
      segments.push({ from: '', date: '', to: '', bodyHtml: elementToHtmlString(bq), bodyText: bq.textContent ?? '' })
    }
    return segments.length > 1 ? segments : null
  }

  return null
}

// ── Plain text splitting ──────────────────────────────────────────────────────

const PLAIN_SEPARATORS = [
  /^-{5,}\s*Original Message\s*-{5,}/im,
  /^_{16,}/m,
  /^From:.*\nSent:/im,
  /^De:.*\nEnviado:/im,
  /^On .+wrote:/im,
]

function splitText(text: string, topFrom: string, topDate: string, topTo: string): ThreadSegment[] | null {
  let splitIdx = -1
  let matchedSep: RegExpExecArray | null = null

  for (const sep of PLAIN_SEPARATORS) {
    const m = sep.exec(text)
    if (m && (splitIdx === -1 || m.index < splitIdx)) {
      splitIdx = m.index
      matchedSep = m
    }
  }
  if (splitIdx === -1 || !matchedSep) return null

  const parts: string[] = []
  let remaining = text
  let offset = 0

  for (const sep of PLAIN_SEPARATORS) {
    const re = new RegExp(sep.source, sep.flags.includes('m') ? sep.flags : sep.flags + 'm')
    const m = re.exec(remaining)
    if (!m) continue
    parts.push(remaining.slice(0, m.index).trim())
    remaining = remaining.slice(m.index + m[0].length).trim()
    offset += m.index + m[0].length
  }
  parts.push(remaining.trim())
  if (parts.length < 2) return null

  return parts.map((p, i) => {
    // Try to extract From/Date from the first lines of non-first segments
    let from = i === 0 ? topFrom : ''
    let date = i === 0 ? topDate : ''
    let to   = i === 0 ? topTo   : ''
    if (i > 0) {
      const fromM = p.match(/^From:\s*(.+)$/im)
      const dateM = p.match(/^(?:Sent|Date):\s*(.+)$/im)
      const toM   = p.match(/^To:\s*(.+)$/im)
      if (fromM) from = fromM[1].trim()
      if (dateM) date = dateM[1].trim()
      if (toM)   to   = toM[1].trim()
    }
    return { from, date, to, bodyHtml: null, bodyText: p }
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export function splitEmailThread(
  bodyHtml: string | null,
  bodyText: string,
  topFrom: string,
  topDate: string,
  topTo: string,
): ThreadSegment[] {
  if (bodyHtml) {
    try {
      const htmlSegments = splitHtml(bodyHtml, topFrom, topDate, topTo)
      if (htmlSegments && htmlSegments.length > 1) return htmlSegments
    } catch { /* fall through */ }
  }

  try {
    const textSegments = splitText(bodyText, topFrom, topDate, topTo)
    if (textSegments && textSegments.length > 1) return textSegments
  } catch { /* fall through */ }

  return [{ from: topFrom, date: topDate, to: topTo, bodyHtml, bodyText }]
}
