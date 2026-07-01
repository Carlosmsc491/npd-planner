// holidayDetect.ts — detect a holiday from a recipe NAME using the configurable
// holidayMap (keyword → holiday value). Case-insensitive substring match, longest
// keyword first so a specific spelling wins over a shorter/ambiguous one.
//
// IMPORTANT: this NEVER modifies the recipe name. "Valentine with you" / "valentine
// red" both detect "VALENTINE" while the name stays exactly as the user wrote it.
// Used by both the creation wizard and the mark-done validation so they agree.

export function detectHolidayFromName(
  name: string,
  holidayMap: Record<string, string> | undefined,
): string {
  if (!name || !holidayMap) return ''
  const upper = name.toUpperCase()
  // Longest keyword first → a specific spelling wins (avoids a short keyword
  // matching inside an unrelated word and producing a false positive).
  const keywords = Object.keys(holidayMap).sort((a, b) => b.length - a.length)
  for (const kw of keywords) {
    if (kw && upper.includes(kw.toUpperCase())) return holidayMap[kw]
  }
  return ''
}
