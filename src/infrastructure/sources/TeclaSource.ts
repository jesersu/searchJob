import type { Job } from '@domain/Job'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { delay, fetchJson } from '../http.js'
import { jobId, stripHtml, toDate } from './support.js'

const ENDPOINT = 'https://api.tecla.io/api/jobs/getPublicJobs/'
/** The public page for one job, as linked from Tecla's own listing: /job?id=<id>. */
const JOB_PAGE = 'https://app.tecla.io/job'
const MAX_PAGES = 10
const PAUSE_MS = 300

interface TeclaJob {
  readonly id?: number
  readonly name?: string
  readonly description?: string
  readonly createdAt?: string
  readonly category?: string
  readonly seniorityName?: string
  readonly commitment?: { readonly name?: string }
  readonly company?: { readonly name?: string }
  readonly requiredSkills?: readonly { readonly skill?: { readonly name?: string } }[]
  readonly city?: string
  readonly state?: string
  readonly minSalary?: number
  readonly maxSalary?: number
  readonly annualSalary?: number
  readonly annualMaxSalary?: number
  readonly salaryType?: string
}

interface TeclaPage {
  readonly data?: {
    readonly jobs?: readonly TeclaJob[]
    readonly pagination?: { readonly countPages?: number }
  }
}

/**
 * The API states no currency. Every employer observed is a US, Canadian or UK
 * company and the listing is shown in dollars, so USD is assumed.
 */
function salaryOf(job: TeclaJob): { usdPerMonth: number | null; raw: string | null } {
  const type = job.salaryType
  const min = job.minSalary ?? 0
  if (min <= 0) return { usdPerMonth: null, raw: null }

  const range = job.maxSalary && job.maxSalary > min ? `${min}-${job.maxSalary}` : `${min}`
  // Tecla spells these "montly" and "annualy"; match the API, not the dictionary.
  if (type === 'montly') return { usdPerMonth: min, raw: `USD ${range} monthly` }
  if (type === 'annualy') {
    return { usdPerMonth: Math.round((job.annualSalary || min) / 12), raw: `USD ${range} annual` }
  }
  // Hourly needs an assumed hours-per-month figure, so only the raw text is kept.
  return { usdPerMonth: null, raw: `USD ${range} ${type ?? 'unknown'}` }
}

/** Tecla timestamps carry no zone ("2026-07-10T19:58:43"); read them as UTC, not local time. */
function asUtc(value: string | undefined): string | undefined {
  return value && !/(Z|[+-]\d\d:?\d\d)$/.test(value) ? `${value}Z` : value
}

/** Pure mapping from one page of Tecla jobs, so it is testable without the network. */
export function mapTeclaJobs(entries: unknown): Job[] {
  if (!Array.isArray(entries)) return []

  const jobs: Job[] = []
  for (const entry of entries as TeclaJob[]) {
    if (typeof entry.id !== 'number' || !entry.name) continue

    const salary = salaryOf(entry)
    const skills = (entry.requiredSkills ?? [])
      .map((s) => s.skill?.name)
      .filter((name): name is string => Boolean(name))
    const location = [entry.city, entry.state].filter(Boolean).join(', ')

    jobs.push({
      // buildJob would canonicalize away "?id=", merging every job into one.
      id: jobId(`${JOB_PAGE}/${entry.id}`),
      source: 'tecla',
      title: entry.name,
      company: entry.company?.name ?? 'unknown',
      url: `${JOB_PAGE}?id=${entry.id}`,
      description: stripHtml(entry.description),
      tags: [...skills, entry.commitment?.name, entry.category, entry.seniorityName].filter(
        (tag): tag is string => Boolean(tag),
      ),
      salaryUsdPerMonth: salary.usdPerMonth,
      salaryRaw: salary.raw,
      // Tecla's own copy: "remote opportunity to be hired ... by a U.S./Canada company".
      remote: true,
      location: location || null,
      publishedAt: toDate(asUtc(entry.createdAt)),
    })
  }
  return jobs
}

/**
 * Tecla's public listing: unauthenticated, paginated with ?page=N (nine jobs
 * per page), and with no query or page-size parameter. Verified by request:
 * `search`, `name`, `limit` and `page_size` are ignored. The domain filters.
 */
export class TeclaSource implements JobSource {
  readonly id = 'tecla'
  readonly capabilities: SourceCapabilities = {
    serverSideQuery: false,
    seniorityFilter: false,
    salaryData: true,
    requiresAuth: false,
  }

  async search(_criteria: SearchCriteria): Promise<Job[]> {
    const jobs: Job[] = []

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const payload = await fetchJson<TeclaPage>(`${ENDPOINT}?page=${page}`)
      const entries = payload.data?.jobs ?? []
      if (entries.length === 0) break

      jobs.push(...mapTeclaJobs(entries))
      if (page >= (payload.data?.pagination?.countPages ?? page)) break
      await delay(PAUSE_MS)
    }
    return jobs
  }
}
