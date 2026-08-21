import type { Job } from '@domain/Job'
import { toUsdPerMonth } from '@domain/Money'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import { allQueries, type SearchCriteria } from '@domain/SearchCriteria'
import { delay, fetchJson } from '../http.js'
import { buildJob, stripHtml, toDate } from './support.js'

const ENDPOINT = 'https://search.torre.co/opportunities/_search/'
/** Torre answers 400 above 20 results per page. */
const SIZE = 20
const PAUSE_MS = 500

interface TorreEntry {
  readonly id?: string
  readonly objective?: string
  readonly organizations?: readonly { readonly name?: string }[]
  readonly compensation?: {
    readonly data?: {
      readonly minAmount?: number
      readonly currency?: string
      readonly periodicity?: string
    }
  }
  readonly remote?: boolean
  readonly locations?: readonly string[]
  readonly tagline?: string
  readonly skills?: readonly { readonly name?: string }[]
  readonly created?: string
}

interface TorreResponse {
  readonly results?: readonly TorreEntry[]
}

export class TorreSource implements JobSource {
  readonly id = 'torre'
  readonly capabilities: SourceCapabilities = {
    serverSideQuery: true,
    seniorityFilter: false,
    salaryData: true,
    requiresAuth: false,
  }

  async search(criteria: SearchCriteria): Promise<Job[]> {
    const jobs: Job[] = []

    for (const query of allQueries(criteria)) {
      const payload = await fetchJson<TorreResponse>(`${ENDPOINT}?size=${SIZE}`, {
        method: 'POST',
        body: { 'skill/role': { text: query, experience: 'potential-to-develop' } },
      })

      for (const entry of payload.results ?? []) {
        if (!entry.id || !entry.objective) continue

        const compensation = entry.compensation?.data
        const currency = compensation?.currency ?? 'USD'
        const periodicity = compensation?.periodicity ?? 'monthly'
        const amount = compensation?.minAmount ?? null

        jobs.push(
          buildJob({
            source: this.id,
            title: entry.objective,
            company: entry.organizations?.[0]?.name ?? 'unknown',
            url: `https://torre.ai/post/${entry.id}`,
            description: stripHtml(
              [entry.tagline, entry.skills?.map((skill) => skill.name).join(', ')].join(' '),
            ),
            tags: entry.skills?.flatMap((skill) => (skill.name ? [skill.name] : [])) ?? [],
            // Torre mixes COP, USD and periodicities. Money.ts is the only guard.
            salaryUsdPerMonth: toUsdPerMonth(amount, currency, periodicity),
            salaryRaw: amount ? `${currency} ${amount}/${periodicity}` : null,
            remote: entry.remote ?? false,
            location: entry.locations?.[0] ?? null,
            publishedAt: toDate(entry.created),
          }),
        )
      }
      await delay(PAUSE_MS)
    }
    return jobs
  }
}
