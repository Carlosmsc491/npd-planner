// Regression tests for the RTF parser — these exact failures shipped to users
// as "\par Hi Sophi" bodies, leaked font tables and broken apostrophes.
import { describe, it, expect } from 'vitest'
import { parseRtf, stripRtfControlWords, decodeCp1252 } from '../src/main/lib/rtf'

const FROMHTML_SAMPLE = [
  '{\\rtf1\\ansi\\ansicpg1252\\fromhtml1',
  '{\\fonttbl{\\f0\\fswiss\\fcharset0 Arial;}{\\f1\\fmodern Courier New;}{\\f2 Symbol;}}',
  '{\\colortbl;\\red0\\green0\\blue0;}',
  '{\\*\\generator Microsoft Word}',
  '{\\*\\htmltag18 <html>}{\\*\\htmltag34 <head>}{\\*\\htmltag1 \\par }{\\*\\htmltag50 </head>}{\\*\\htmltag66 <body>}',
  "{\\*\\htmltag0 \\par }{\\*\\htmltag64 <p>}\\htmlrtf \\f0\\fs24 \\htmlrtf0 Hi Sophi, I\\'92ll keep you \\'93updated\\'94{\\*\\htmltag72 </p>}\\htmlrtf\\par\\htmlrtf0",
  '{\\*\\htmltag96 <table border=1>}{\\*\\htmltag4 \\par \\par }{\\*\\htmltag112 <tr>}{\\*\\htmltag148 <td>}PO{\\*\\htmltag156 </td>}{\\*\\htmltag116 </tr>}{\\*\\htmltag104 </table>}',
  '{\\*\\htmltag74 </body>}{\\*\\htmltag26 </html>}}',
].join('')

describe('parseRtf — HTML mode (\\fromhtml1)', () => {
  const html = parseRtf(FROMHTML_SAMPLE, true)

  it('does not leak the font table as text', () => {
    expect(html).not.toContain('Arial')
    expect(html).not.toContain('Courier New')
  })

  it('does not emit literal \\par tokens', () => {
    expect(html).not.toContain('\\par')
  })

  it('decodes cp1252 smart quotes and apostrophes', () => {
    expect(html).toContain('I’ll')
    expect(html).toContain('“updated”')
  })

  it('reconstructs the embedded HTML structure', () => {
    expect(html).toContain('<p>Hi Sophi')
    expect(html).toContain('<table border=1>')
    expect(html).toContain('<td>PO</td>')
  })
})

describe('parseRtf — text mode', () => {
  it('extracts readable text without HTML source', () => {
    const text = parseRtf(FROMHTML_SAMPLE, false)
    expect(text).toContain('Hi Sophi')
    expect(text).not.toContain('<p>')
    expect(text).not.toContain('Arial')
  })
})

describe('stripRtfControlWords', () => {
  it('routes full RTF documents through the parser (no fonttbl leak)', () => {
    const fullDoc = "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Hello\\par World I\\'92m here\\par\\par\\par End}"
    const out = stripRtfControlWords(fullDoc)
    expect(out).toBe('Hello\nWorld I’m here\n\nEnd')
  })

  it('strips control words from partial RTF fragments', () => {
    const out = stripRtfControlWords("Hi\\par there I\\'92m ok \\pard\\f0 done")
    expect(out).toBe('Hi\nthere I’m ok done')
  })

  it('returns plain text unchanged', () => {
    expect(stripRtfControlWords('Just a normal sentence.')).toBe('Just a normal sentence.')
  })
})

describe('decodeCp1252', () => {
  it('maps the 0x80-0x9F range to proper Unicode', () => {
    expect(decodeCp1252(0x92)).toBe('’')
    expect(decodeCp1252(0x93)).toBe('“')
    expect(decodeCp1252(0x96)).toBe('–')
    expect(decodeCp1252(0x80)).toBe('€')
  })

  it('passes through plain latin-1 codes', () => {
    expect(decodeCp1252(0xE9)).toBe('é')
  })
})
