import type { Job } from '@domain/Job'
import { toUsdPerMonth } from '@domain/Money'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { delay, fetchJson } from '../http.js'
import { buildJob, stripHtml, toDate } from './support.js'

const ENDPOINT = 'https://remoteok.com/api'
const PAUSE_MS = 600

interface RemoteOkEntry {
  readonly position?: string
  readonly company?: string
  readonly url?: string
  readonly description?: string
  readonly tags?: unknown
  readonly salary_min?: number
  readonly salary_max?: number
  readonly date?: string
  readonly location?: string
}

/** Remote OK filters by tag slug, so multi-word queries become hyphenated. */
function toTag(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, '-')
}

export class RemoteOkSource implements JobSource {
  readonly id = 'remoteok'
  readonly capabilities: SourceCapabilities = {
    serverSideQuery: true,
    seniorityFilter: false,
    salaryData: true,
    requiresAuth: false,
  }

  async search(criteria: SearchCriteria): Promise<Job[]> {
    const jobs: Job[] = []
    const tags = new Set(criteria.mustHaveAny.map(toTag))

    for (const tag of tags) {
      const payload = await fetchJson<readonly RemoteOkEntry[]>(
        `${ENDPOINT}?tags=${encodeURIComponent(tag)}`,
      )

      for (const entry of payload) {
        // The first element of the feed is a legal notice, not a job.
        if (!entry.position || !entry.url) continue

        jobs.push(
          buildJob({
            source: this.id,
            title: entry.position,
            company: entry.company ?? 'unknown',
            url: entry.url,
            description: stripHtml(entry.description),
            // Deliberately dropped. Remote OK sprays category tags that do not
            // describe the role: a live run tagged a Watchmaker, a Handyperson,
            // a Valet and a Surveyor as mobile work. 180 of 186 "relevant"
            // results passed the domain gate on tags alone. The title is the
            // only trustworthy signal this source publishes.
            tags: [],
            // Remote OK publishes annual USD figures.
            salaryUsdPerMonth: toUsdPerMonth(entry.salary_min ?? null, 'USD', 'yearly'),
            salaryRaw: entry.salary_min ? `USD ${entry.salary_min}/yr` : null,
            remote: true,
            location: entry.location ?? null,
            publishedAt: toDate(entry.date),
          }),
        )
      }
      await delay(PAUSE_MS)
    }
    return jobs
  }
}
