import type { Job } from '@domain/Job'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { fetchJson } from '../http.js'
import { buildJob, errorMessage, warnPartial } from './support.js'

const ENDPOINT = 'https://api.lever.co/v0/postings'
const DEFAULT_BOARDS = ['coderio'] as const

/** Lever publishes placeholder ranges (0 or 1); anything below this is not a salary. */
const MIN_PLAUSIBLE_AMOUNT = 100

interface LeverPosting {
  readonly text?: string
  readonly hostedUrl?: string
  readonly createdAt?: number
  readonly country?: string
  readonly workplaceType?: string
  readonly descriptionPlain?: string
  readonly descriptionBodyPlain?: string
  readonly additionalPlain?: string
  readonly categories?: {
    readonly commitment?: string
    readonly department?: string
    readonly location?: string
    readonly allLocations?: readonly string[]
    readonly team?: string
  }
  readonly salaryRange?: {
    readonly min?: number
    readonly max?: number
    readonly currency?: string
    readonly interval?: string
  }
}

function salaryOf(range: LeverPosting['salaryRange']): {
  usdPerMonth: number | null
  raw: string | null
} {
  const min = range?.min ?? 0
  if (!range || min < MIN_PLAUSIBLE_AMOUNT) return { usdPerMonth: null, raw: null }

  const currency = range.currency ?? 'USD'
  const interval = range.interval ?? 'unknown'
  const max = range.max && range.max > min ? `-${range.max}` : ''
  const raw = `${currency} ${min}${max} ${interval}`

  // Only USD is normalized: converting other currencies needs rates this source does not own.
  if (currency !== 'USD') return { usdPerMonth: null, raw }
  if (interval === 'per-month-salary') return { usdPerMonth: min, raw }
  if (interval === 'per-year-salary') return { usdPerMonth: Math.round(min / 12), raw }
  return { usdPerMonth: null, raw }
}

/**
 * Lever repeats the same text in `descriptionPlain` and `descriptionBodyPlain`
 * (15 of 15 live postings were identical). Join the parts, dropping any part
 * already contained in another one.
 */
function descriptionOf(posting: LeverPosting): string {
  const parts = [posting.descriptionPlain, posting.descriptionBodyPlain, posting.additionalPlain].filter(
    (part): part is string => Boolean(part),
  )
  return parts
    .filter((part, i) => !parts.some((other, j) => j !== i && other.includes(part) && (other !== part || j < i)))
    .join('\n')
}

/**
 * `categories.location` is only the primary one. A posting open to several
 * countries lists them all in `allLocations`, and the domain's location
 * filter needs every one of them.
 */
function locationOf(posting: LeverPosting): string | null {
  const categories = posting.categories ?? {}
  const all = Array.isArray(categories.allLocations)
    ? categories.allLocations.filter((place) => typeof place === 'string' && place.trim() !== '')
    : []
  if (all.length > 0) return all.join(', ')
  return categories.location ?? posting.country ?? null
}

/** Pure mapping from Lever's postings array, so it is testable without the network. */
export function mapLeverPostings(payload: unknown, board: string): Job[] {
  if (!Array.isArray(payload)) return []

  const jobs: Job[] = []
  for (const posting of payload as (LeverPosting | null)[]) {
    if (!posting || typeof posting !== 'object') continue
    if (!posting.text || !posting.hostedUrl) continue

    const salary = salaryOf(posting.salaryRange)
    const categories = posting.categories ?? {}
    jobs.push(
      buildJob({
        source: 'lever',
        title: posting.text,
        company: board,
        url: posting.hostedUrl,
        description: descriptionOf(posting),
        tags: [categories.team, categories.department, categories.commitment].filter(
          (tag): tag is string => Boolean(tag),
        ),
        salaryUsdPerMonth: salary.usdPerMonth,
        salaryRaw: salary.raw,
        remote: posting.workplaceType === 'remote',
        location: locationOf(posting),
        publishedAt:
          typeof posting.createdAt === 'number' ? new Date(posting.createdAt) : null,
      }),
    )
  }
  return jobs
}

/**
 * Lever public postings API: one board per company slug, no key, no query
 * parameter. The domain does all the filtering. A broken board is skipped (and
 * reported) as long as at least one other board answers; if all fail, the
 * error surfaces.
 */
export class LeverSource implements JobSource {
  readonly id = 'lever'
  readonly capabilities: SourceCapabilities = {
    serverSideQuery: false,
    seniorityFilter: false,
    salaryData: true,
    requiresAuth: false,
  }

  constructor(private readonly boards: readonly string[] = DEFAULT_BOARDS) {}

  async search(_criteria: SearchCriteria): Promise<Job[]> {
    const results = await Promise.allSettled(
      this.boards.map(async (board) => {
        const payload = await fetchJson<unknown>(`${ENDPOINT}/${board}?mode=json`)
        return mapLeverPostings(payload, board)
      }),
    )

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failures.length === results.length && failures[0]) throw failures[0].reason

    if (failures.length > 0) {
      const detail = results
        .flatMap((r, i) =>
          r.status === 'rejected' ? [`${this.boards[i]} (${errorMessage(r.reason)})`] : [],
        )
        .join(', ')
      warnPartial(this.id, `tableros omitidos: ${detail}`)
    }

    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  }
}
