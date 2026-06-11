// src/main/lib/rtf.ts — Pure RTF parsing helpers (no Electron imports, unit-testable)
// Extracted from emailHandlers.ts so regressions in email rendering are caught
// by tests instead of by users seeing \\par tokens again.

// ── Windows-1252 decoding for RTF \'xx escapes ────────────────────────────────
// Codes 0x80–0x9F differ between cp1252 and Unicode (smart quotes, dashes, €).
// Decoding them with fromCharCode produces invisible control chars (shown as �).
const CP1252_MAP: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š',
  0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
  0x9E: 'ž', 0x9F: 'Ÿ',
}

export function decodeCp1252(code: number): string {
  return CP1252_MAP[code] ?? String.fromCharCode(code)
}

// RTF destination groups whose content must never appear as body text.
// {\fonttbl...} leaking is what shows "Arial; Courier New; Symbol;..." in the viewer.
const RTF_SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'pict', 'object',
  'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'listtable',
  'listoverridetable', 'rsidtbl', 'xmlnstbl', 'mmathPr', 'pgptbl', 'filetbl',
])

// ── RTF parser ────────────────────────────────────────────────────────────────
// asHtml=true: Outlook \fromhtml1 RTF → reconstruct the embedded HTML from
//   {\*\htmltag<n>} blocks plus the \htmlrtf0 text-fallback sections.
// asHtml=false: any RTF → plain readable text (htmltag groups are HTML source,
//   so they are discarded; \par becomes a newline).
//
// Three failure modes of the previous version, all fixed here:
//   1. {\fonttbl}/{\colortbl} group content leaked into the output as text.
//   2. Content inside {\*\htmltag} groups was copied verbatim, so RTF control
//      words like \par embedded in those groups appeared literally as "\par".
//   3. \'9x escapes decoded as raw charcodes → control chars instead of ’ “ ” –.
export function parseRtf(rtfStr: string, asHtml: boolean): string {
  const BS = '\\'
  const output: string[] = []
  let i = 0
  let depth = 0
  let htmlMode = true        // \htmlrtf toggles text-fallback suppression
  let skipDepth = -1         // >=0 → inside a destination group being discarded
  let htmltagDepth = -1      // >=0 → inside a {\*\htmltag} group (emit raw HTML source)
  let ucSkip = 1             // \ucN — fallback chars to skip after \uN
  let pendingUcSkip = 0      // chars still to swallow after a \uN escape

  const emitting = (): boolean => skipDepth === -1 && (htmltagDepth !== -1 || htmlMode)

  const emit = (s: string): void => {
    if (pendingUcSkip > 0) { pendingUcSkip--; return }
    if (emitting()) output.push(s)
  }

  while (i < rtfStr.length) {
    const ch = rtfStr[i]

    if (ch === '{') {
      depth++
      // Peek the destination control word right after the brace
      const rest = rtfStr.slice(i + 1, i + 40)
      const starMatch = rest.match(/^\\\*\\([a-zA-Z]+)/)
      const plainMatch = rest.match(/^\\([a-zA-Z]+)/)
      if (skipDepth === -1) {
        if (starMatch && (starMatch[1] !== 'htmltag' || !asHtml)) {
          // Unknown \* destination — RTF spec says ignore entirely.
          // In text mode htmltag groups are HTML source, not text → also skip.
          skipDepth = depth
        } else if (starMatch && starMatch[1] === 'htmltag' && htmltagDepth === -1) {
          htmltagDepth = depth
        } else if (!starMatch && plainMatch && RTF_SKIP_DESTINATIONS.has(plainMatch[1])) {
          skipDepth = depth
        }
      }
      i++; continue
    }

    if (ch === '}') {
      if (depth === skipDepth) skipDepth = -1
      if (depth === htmltagDepth) htmltagDepth = -1
      depth--
      i++; continue
    }

    if (ch === BS) {
      i++
      if (i >= rtfStr.length) break
      const next = rtfStr[i]
      // Escaped literals
      if (next === BS) { emit(BS); i++; continue }
      if (next === '{') { emit('{'); i++; continue }
      if (next === '}') { emit('}'); i++; continue }
      if (next === '*') { i++; continue }
      if (next === '-' || next === '|' || next === ':') { i++; continue }
      if (next === '~') { emit(asHtml ? '&nbsp;' : ' '); i++; continue }
      if (next === '_') { emit('-'); i++; continue }
      if (next === "'") {
        const hex = rtfStr.substring(i + 1, i + 3)
        const code = parseInt(hex, 16)
        i += 3
        if (isNaN(code)) continue
        if (pendingUcSkip > 0) { pendingUcSkip--; continue }
        if (!emitting()) continue
        if (code === 0xa0) output.push(asHtml ? '&nbsp;' : ' ')
        else output.push(decodeCp1252(code))
        continue
      }

      // Control word: \word or \wordN or \word-N
      let word = ''
      while (i < rtfStr.length && /[a-zA-Z]/.test(rtfStr[i])) { word += rtfStr[i]; i++ }
      let param = ''
      if (i < rtfStr.length && (rtfStr[i] === '-' || /[\d]/.test(rtfStr[i]))) {
        if (rtfStr[i] === '-') { param += '-'; i++ }
        while (i < rtfStr.length && /[\d]/.test(rtfStr[i])) { param += rtfStr[i]; i++ }
      }
      if (i < rtfStr.length && rtfStr[i] === ' ') i++

      if (word === 'htmlrtf') { htmlMode = (param === '0'); continue }
      if (word === 'uc') { ucSkip = param ? parseInt(param, 10) : 1; continue }
      if (word === 'u' && param) {
        let code = parseInt(param, 10)
        if (code < 0) code += 65536
        if (emitting()) output.push(asHtml ? `&#${code};` : String.fromCodePoint(code))
        pendingUcSkip = ucSkip
        continue
      }
      if (word === 'bin' && param) {
        // Binary blob — skip raw bytes entirely
        i += Math.max(0, parseInt(param, 10))
        continue
      }
      if (word === 'par' || word === 'line') {
        // Inside htmltag groups \par encodes a source-code newline (HTML collapses
        // whitespace, so '\n' is safe); in text fallback it is a visual break.
        if (htmltagDepth !== -1 || !asHtml) emit('\n')
        else emit('<br>')
        continue
      }
      if (word === 'tab') { emit(htmltagDepth !== -1 || !asHtml ? '\t' : '&nbsp;&nbsp;&nbsp;'); continue }
      // All other control words (\f0, \cf1, \fs20, ...) carry no text — drop them
      continue
    }

    if (ch !== '\r' && ch !== '\n') emit(ch)
    else if (htmltagDepth !== -1) emit('\n')
    i++
  }
  return output.join('')
}

// ── Strip RTF control words from plain-text body ─────────────────────────────
// msgreader sometimes returns fileData.body as raw RTF (PR_BODY_RTF fallback)
// instead of clean plain text, resulting in \par \pard \fonttbl etc. appearing
// in the viewer. This function strips them out while preserving paragraph breaks.
export function stripRtfControlWords(text: string): string {
  // If no backslash-word sequences, nothing to do
  if (!text.includes('\\par') && !text.includes('\\pard') && !text.includes('\\rtf')) {
    return text
  }
  // Full RTF document — use the real parser so header groups (fonttbl, colortbl)
  // don't leak as text and \'xx escapes decode correctly
  if (text.includes('{\\rtf')) {
    return parseRtf(text, false)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return text
    // Turn \par / \line into line breaks (preserve paragraph structure)
    .replace(/\\par\b[ \t]*/gi, '\n')
    .replace(/\\line\b[ \t]*/gi, '\n')
    .replace(/\\tab\b[ \t]*/gi, '\t')
    // Strip remaining control words (\word or \word123)
    .replace(/\\[a-zA-Z]+\d*[ \t]?/g, '')
    // Strip literal \\ escapes; decode hex chars as Windows-1252
    .replace(/\\\\/g, '\\')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, h: string) => decodeCp1252(parseInt(h, 16)))
    // Strip RTF group braces
    .replace(/[{}]/g, '')
    // Collapse runs of 3+ newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

