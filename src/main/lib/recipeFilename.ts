// src/main/lib/recipeFilename.ts — Pure filename parsing (unit-testable)

/**
 * Parse a recipe filename like "$12.99 A VALENTINE.xlsx"
 * into { price, option, name, displayName }
 */
export function parseRecipeFilename(filename: string): {
  price: string
  option: string
  name: string
  displayName: string
} {
  // Remove extension
  const base = filename.replace(/\.xlsx$/i, '').trim()
  const displayName = base

  // Tokenize
  const tokens = base.split(/\s+/)
  let price = ''
  let option = ''
  let nameTokens: string[] = []

  const priceRegex = /^\$?\d+(?:\.\d{1,2})?$/
  const optionRegex = /^[A-C]$/

  let i = 0
  // Find price token
  if (i < tokens.length && priceRegex.test(tokens[i])) {
    price = tokens[i].startsWith('$') ? tokens[i] : `$${tokens[i]}`
    i++
    // Find option token immediately after price
    if (i < tokens.length && optionRegex.test(tokens[i])) {
      option = tokens[i]
      i++
    }
  }
  nameTokens = tokens.slice(i)

  return {
    price,
    option,
    name: nameTokens.join(' '),
    displayName,
  }
}
