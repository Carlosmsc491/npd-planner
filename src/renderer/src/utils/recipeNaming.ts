// src/renderer/src/utils/recipeNaming.ts
// Normalization and parsing of recipe file names
// Ported from EliteQuote services/recipe_service.py → normalizeRecipeName()

const PRICE_REGEX = /^\$?\d+(?:\.\d{1,2})?$/
const OPTION_REGEX = /^[A-C]$/

/**
 * Strip characters that are illegal in Windows file/folder names: \ / : * ? " < > |
 * and collapse multiple spaces.
 */
export function sanitizeWindowsName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize separate components into a canonical recipe display name.
 * Examples:
 *   ("12.99", "A", "Valentine")  → "$12.99 A VALENTINE"
 *   ("9.99",  "",  "Rose")       → "$9.99 ROSE"
 */
export function normalizeRecipeName(price: string, option: string, name: string): string {
  let normalizedPrice = price.trim()
  if (normalizedPrice && !normalizedPrice.startsWith('$')) {
    normalizedPrice = `$${normalizedPrice}`
  }

  const parts: string[] = []
  if (normalizedPrice) parts.push(normalizedPrice)
  if (option.trim()) parts.push(option.trim())
  if (name.trim()) parts.push(name.trim())

  return parts.join(' ').toUpperCase()
}

/**
 * Parse a recipe filename (with or without .xlsx) into its components.
 * Examples:
 *   "$12.99 A VALENTINE.xlsx" → { price: "$12.99", option: "A", name: "VALENTINE" }
 *   "$9.99 ROSE.xlsx"         → { price: "$9.99",  option: "",  name: "ROSE" }
 *   "SOME NAME DONE BY X.xlsx" → { price: "", option: "", name: "SOME NAME DONE BY X" }
 */
export function parseRecipeNameFromFilename(filename: string): {
  price: string
  option: string
  name: string
} {
  const base = filename.replace(/\.xlsx$/i, '').trim()
  const tokens = base.split(/\s+/)

  let price = ''
  let option = ''
  let i = 0

  if (i < tokens.length && PRICE_REGEX.test(tokens[i])) {
    price = tokens[i].startsWith('$') ? tokens[i] : `$${tokens[i]}`
    i++
    if (i < tokens.length && OPTION_REGEX.test(tokens[i])) {
      option = tokens[i]
      i++
    }
  }

  const name = tokens.slice(i).join(' ')
  return { price, option, name }
}
