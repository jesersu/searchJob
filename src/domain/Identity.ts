import type { Job } from './Job.js'

/**
 * Content identity of an offer, independent of where it was published.
 *
 * URL deduplication only catches the same link twice. Companies post the same
 * opening to several boards, so one BairesDev role reached the ranking through
 * both Torre and LinkedIn with two URLs and two different scores.
 */

const UNNAMED_COMPANY = 'unknown'

/**
 * Requisition codes: "REF#301108", "REF #301108", "req: 301108".
 * The trailing \b after the keyword stops "Referral bonus" from being read as
 * reference "erral".
 */
const REFERENCE_PATTERN = /\b(?:ref|req|requisition|job\s*id)\b\s*[#:.]?\s*([a-z0-9][a-z0-9-]{2,})\b/i

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A requisition code must carry at least one digit to be one. */
function referenceCode(title: string): string | null {
  const candidate = REFERENCE_PATTERN.exec(title)?.[1]
  if (candidate === undefined || !/\d/.test(candidate)) return null
  return normalize(candidate)
}

/**
 * Two offers sharing this key are the same opening.
 *
 * Falls back to URL identity when the company is unnamed: an anonymous posting
 * is not evidence of sameness, and collapsing on title alone would merge
 * unrelated roles.
 */
export function contentKey(job: Job): string {
  const company = normalize(job.company)
  if (company.length === 0 || company === UNNAMED_COMPANY) return `url:${job.id}`

  const reference = referenceCode(job.title)
  if (reference !== null) return `${company}|ref:${reference}`

  return `${company}|${normalize(job.title)}`
}

export function isSameOffer(a: Job, b: Job): boolean {
  return contentKey(a) === contentKey(b)
}
