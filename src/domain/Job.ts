/** A job offer, normalized from any source. Immutable by contract. */
export interface Job {
  /** Stable identity across runs. Derived from the canonical URL. */
  readonly id: string
  readonly source: string
  readonly title: string
  readonly company: string
  readonly url: string
  readonly description: string
  readonly tags: readonly string[]
  /** Normalized salary floor, or null when the source published none. */
  readonly salaryUsdPerMonth: number | null
  /** Original salary text, kept for the report. */
  readonly salaryRaw: string | null
  readonly remote: boolean
  readonly location: string | null
  readonly publishedAt: Date | null
}

/** Everything the scorer reads when computing a score. */
export function searchableText(job: Job): string {
  return [job.title, job.company, job.tags.join(' '), job.description].join(' \n ')
}

/**
 * Text allowed to decide whether an offer is on target at all.
 *
 * Free-text bodies are excluded on purpose: English prose contains "swift"
 * (fast), "combine", "rest" and "flutter", which let a watchmaker and a
 * handyperson score 63 in an iOS search. A role is what its title and tags
 * say it is.
 */
export function gateText(job: Job): string {
  return [job.title, job.tags.join(' ')].join(' \n ')
}
