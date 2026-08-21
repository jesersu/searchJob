import type { Job } from '@domain/Job'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { delay, fetchJson } from '../http.js'
import { asStringArray, buildJob, stripHtml, toDate } from './support.js'

const ENDPOINT = 'https://www.arbeitnow.com/api/job-board-api'
const MAX_PAGES = 3
const PAUSE_MS = 400

interface ArbeitnowEntry {
  readonly slug?: string
  readonly title?: string
  readonly company_name?: string
  readonly url?: string
  readonly description?: string
  readonly tags?: unknown
  readonly job_types?: unknown
  readonly location?: string
  readonly remote?: boolean
  readonly created_at?: number
}

interface ArbeitnowResponse {
  readonly data?: readonly ArbeitnowEntry[]
}

/** Arbeitnow has no query parameter: it paginates and the domain filters. */
export class ArbeitnowSource implements JobSource {
  readonly id = 'arbeitnow'
  readonly capabilities: SourceCapabilities = {
    serverSideQuery: false,
    seniorityFilter: false,
    salaryData: false,
    requiresAuth: false,
  }

  async search(_criteria: SearchCriteria): Promise<Job[]> {
    const jobs: Job[] = []

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const payload = await fetchJson<ArbeitnowResponse>(`${ENDPOINT}?page=${page}`)
      const entries = payload.data ?? []
      if (entries.length === 0) break

      for (const entry of entries) {
        if (!entry.url || !entry.title) continue

        jobs.push(
          buildJob({
            source: this.id,
            title: entry.title,
            company: entry.company_name ?? 'unknown',
            url: entry.url,
            description: stripHtml(entry.description),
            tags: [...asStringArray(entry.tags), ...asStringArray(entry.job_types)],
            salaryUsdPerMonth: null,
            salaryRaw: null,
            remote: entry.remote ?? false,
            location: entry.location ?? null,
            publishedAt: toDate(entry.created_at),
          }),
        )
      }
      await delay(PAUSE_MS)
    }
    return jobs
  }
}
