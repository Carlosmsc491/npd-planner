import { describe, it, expect } from 'vitest'
import { parseRecipeFilename } from '../src/main/lib/recipeFilename'

describe('parseRecipeFilename', () => {
  it('parses price + option + name', () => {
    expect(parseRecipeFilename('$12.99 A VALENTINE.xlsx')).toEqual({
      price: '$12.99', option: 'A', name: 'VALENTINE', displayName: '$12.99 A VALENTINE',
    })
  })

  it('parses price without option', () => {
    expect(parseRecipeFilename('$9.99 GREAT AMERICAN PIE.xlsx')).toEqual({
      price: '$9.99', option: '', name: 'GREAT AMERICAN PIE', displayName: '$9.99 GREAT AMERICAN PIE',
    })
  })

  it('normalizes a missing $ prefix on the price', () => {
    expect(parseRecipeFilename('14.99 B XMAS.xlsx').price).toBe('$14.99')
  })

  it('treats a name-only file as having no price', () => {
    const r = parseRecipeFilename('STANDARD ROSE.xlsx')
    expect(r.price).toBe('')
    expect(r.name).toBe('STANDARD ROSE')
  })

  it('does not consume a leading A/B/C as option without a price', () => {
    const r = parseRecipeFilename('A VALENTINE.xlsx')
    expect(r.option).toBe('')
    expect(r.name).toBe('A VALENTINE')
  })
})
