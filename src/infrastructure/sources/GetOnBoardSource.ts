import type { Job } from '@domain/Job'
import { toUsdPerMonth } from '@domain/Money'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import { allQueries, type SearchCriteria } from '@domain/SearchCriteria'
import { delay, fetchJson } from '../http.js'
import { asStringArray, buildJob, stripHtml, toDate } from './support.js'

const ENDPOINT = 'https://www.getonbrd.com/api/v0/search/jobs'
const PER_PAGE = 50
const PAUSE_MS = 400

interface GobResponse {
  readonly data?: readonly {
    readonly id?: string
    readonly links?: { readonly public_url?: string }
    readonly attributes?: Record<string, unknown>
  }[]
}

/** Salaries on Get on Board are published in USD per month. */
const CURRENCY = 'USD'
const PERIODICITY = 'monthly'

export class GetOnBoardSource implements JobSource {
  readonly id = 'getonboard'
  readonly capabilities: SourceCapabilities = {
    serverSideQuery: true,
    seniorityFilter: true,
    salaryData: true,
    requiresAuth: false,
  }

  async search(criteria: SearchCriteria): Promise<Job[]> {
    const jobs: Job[] = []

    for (const query of allQueries(criteria)) {
      const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&expand[]=company`
      const payload = await fetchJson<GobResponse>(url)

      for (const entry of payload.data ?? []) {
        // The public URL lives under links, never under attributes.
        const publicUrl = entry.links?.public_url
        if (!publicUrl) continue

        const attributes = entry.attributes ?? {}
        // JSON:API nesting: attributes.company.data.attributes.name
        const company = attributes['company'] as
          | { data?: { attributes?: { name?: string } } }
          | undefined
        const minSalary = attributes['min_salary']

        jobs.push(
          buildJob({
            source: this.id,
            title: String(attributes['title'] ?? ''),
            company: company?.data?.attributes?.name ?? 'unknown',
            url: publicUrl,
            description: stripHtml(String(attributes['description'] ?? '')),
            tags: asStringArray(attributes['tags']),
            salaryUsdPerMonth: toUsdPerMonth(
              typeof minSalary === 'number' ? minSalary : null,
              CURRENCY,
              PERIODICITY,
            ),
            salaryRaw: typeof minSalary === 'number' && minSalary > 0 ? `USD ${minSalary}/mo` : null,
            remote: attributes['remote'] === true,
            location: (attributes['remote_zone'] as string | undefined) ?? null,
            publishedAt: toDate(attributes['published_at']),
          }),
        )
      }
      await delay(PAUSE_MS)
    }
    return jobs
  }
}
