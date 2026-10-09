import type { Job } from '@domain/Job'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { fetchJson } from '../http.js'
import { buildJob } from './support.js'

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

/** Pure mapping from Lever's postings array, so it is testable without the network. */
export function mapLeverPostings(payload: unknown, board: string): Job[] {
  if (!Array.isArray(payload)) return []

  const jobs: Job[] = []
  for (const posting of payload as LeverPosting[]) {
    if (!posting.text || !posting.hostedUrl) continue

    const salary = salaryOf(posting.salaryRange)
    const categories = posting.categories ?? {}
    jobs.push(
      buildJob({
        source: 'lever',
        title: posting.text,
        company: board,
        url: posting.hostedUrl,
        description: [posting.descriptionPlain, posting.descriptionBodyPlain, posting.additionalPlain]
          .filter(Boolean)
          .join('\n'),
        tags: [categories.team, categories.department, categories.commitment].filter(
          (tag): tag is string => Boolean(tag),
        ),
        salaryUsdPerMonth: salary.usdPerMonth,
        salaryRaw: salary.raw,
        remote: posting.workplaceType === 'remote',
        location: categories.location ?? posting.country ?? null,
        publishedAt:
          typeof posting.createdAt === 'number' ? new Date(posting.createdAt) : null,
      }),
    )
  }
  return jobs
}

/**
 * Lever public postings API: one board per company slug, no key, no query
 * parameter. The domain does all the filtering. A broken board is skipped as
 * long as at least one other board answers; if all fail, the error surfaces.
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

    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  }
}
