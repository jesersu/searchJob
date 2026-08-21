/**
 * Token-aware term matching.
 *
 * Naive substring matching is unusable for this domain: searching for "ios"
 * inside Spanish job titles matches "NegocIOS", "ServicIOS", "InventarIOS".
 * Every term must therefore match on token boundaries, not raw substrings.
 */

const WORD = '\\p{L}\\p{N}'

/** Characters that separate tokens: "react native", "react-native", "react_native". */
const SEPARATOR_CLASS = '[\\s\\-/_]+'
const SEPARATOR_SPLIT = /[\s\-/_]+/

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Builds a pattern where separators inside the term match any separator run. */
function buildPattern(term: string): string {
  return term
    .trim()
    .split(SEPARATOR_SPLIT)
    .filter((part) => part.length > 0)
    .map(escapeRegExp)
    .join(SEPARATOR_CLASS)
}

/** True when `term` appears in `text` as a whole token, case-insensitively. */
export function containsTerm(text: string, term: string): boolean {
  const body = buildPattern(term)
  if (body.length === 0) return false

  const pattern = new RegExp(`(?<![${WORD}])${body}(?![${WORD}])`, 'iu')
  return pattern.test(text)
}

/** True when at least one term appears in `text`. */
export function containsAnyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => containsTerm(text, term))
}

/** Returns the subset of `terms` present in `text`. Used for match explanations. */
export function matchedTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => containsTerm(text, term))
}
