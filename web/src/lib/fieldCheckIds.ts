// Alphanumeric-only id generator (A-Za-z0-9) — deliberately excludes `_`/`-`.
//
// See project memory "npd-photo-manifest-uid-underscore-bug": a nanoid()
// containing `_` silently truncated a photo manifest filename downstream and
// ate real photos before anyone noticed. Field Check photo ids ultimately
// feed the same SharePoint / Photo Manager pipeline (gospotcheck/README.md
// §7.7), so every id minted in this module — visit, photo, draft, queue —
// sticks to this alphabet, not just photo ids.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function newId(length = 20): string {
  const bytes = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    // Extremely old browser fallback — Math.random is fine here, ids just need to be unique, not secure.
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}
