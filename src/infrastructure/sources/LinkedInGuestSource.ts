import type { Job } from '@domain/Job'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import { allQueries, type SearchCriteria } from '@domain/SearchCriteria'
import { delay, fetchText } from '../http.js'
import { buildJob, stripHtml, toDate } from './support.js'

/**
 * LinkedIn's public guest endpoint — the one that serves its logged-out job
 * search pages. No account, no session, no browser automation, and therefore
 * no risk to anyone's LinkedIn account.
 *
 * What it does not give us: a description or a salary. Guest cards carry only
 * title, company, location and publication date, so these jobs score on their
 * title alone and rank below sources that publish a body.
 */
const ENDPOINT = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search'

/** LinkedIn's workplace-type filter: 2 is "remote". */
const REMOTE_FILTER = '2'
export const SECONDS_PER_DAY = 86_400
const PAUSE_MS = 900

const CARD_PATTERN = /<li>([\s\S]*?)<\/li>/g
const URN_PATTERN = /urn:li:jobPosting:(\d+)/
const TITLE_PATTERN = /<span class="sr-only">\s*([\s\S]*?)\s*<\/span>/
const COMPANY_PATTERN = /<h4[^>]*subtitle[^>]*>([\s\S]*?)<\/h4>/
const LOCATION_PATTERN = /job-search-card__location[^>]*>\s*([\s\S]*?)\s*<\/span>/
const DATE_PATTERN = /<time[^>]*datetime="([^"]+)"/

function firstMatch(block: string, pattern: RegExp): string | null {
  const match = pattern.exec(block)
  return match?.[1] ? stripHtml(match[1]) : null
}

/**
 * Parses a guest search response into jobs. Pure and exported so the HTML
 * contract is covered by a fixture test rather than by a live request.
 */
export function parseGuestCards(html: string, remote: boolean): Job[] {
  const jobs: Job[] = []

  for (const match of html.matchAll(CARD_PATTERN)) {
    const card = match[1] ?? ''

    const id = URN_PATTERN.exec(card)?.[1]
    const title = firstMatch(card, TITLE_PATTERN)
    if (!id || !title) continue

    jobs.push(
      buildJob({
        source: 'linkedin',
        title,
        company: firstMatch(card, COMPANY_PATTERN) ?? 'unknown',
        // Cards link to a country subdomain with tracking parameters. The
        // posting id is the only stable identity across searches.
        url: `https://www.linkedin.com/jobs/view/${id}`,
        description: '',
        tags: [],
        salaryUsdPerMonth: null,
        salaryRaw: null,
        remote,
        location: firstMatch(card, LOCATION_PATTERN),
        publishedAt: toDate(firstMatch(card, DATE_PATTERN)),
      }),
    )
  }
  return jobs
}

/**
 * Exported and pure for testing: the query-string contract is what matters,
 * not the network call around it.
 */
export function buildSearchUrl(query: string, criteria: SearchCriteria): string {
  const params = new URLSearchParams({ keywords: query, start: '0' })

  if (criteria.country !== null) params.set('location', criteria.country)
  if (criteria.remote === 'required') params.set('f_WT', REMOTE_FILTER)

  // f_TPR = "Time Posted Range". LinkedIn does the filtering, so this source
  // stops fetching offers the domain would discard anyway. Rounded up: --since
  // yields a fractional day budget, and flooring it here would ask LinkedIn
  // for a narrower window than the domain filter actually allows.
  if (criteria.maxAgeDays !== null) {
    const seconds = Math.ceil(criteria.maxAgeDays) * SECONDS_PER_DAY
    params.set('f_TPR', `r${seconds}`)
  }

  return `${ENDPOINT}?${params.toString()}`
}

export class LinkedInGuestSource implements JobSource {
  readonly id = 'linkedin'
  readonly capabilities: SourceCapabilities = {
    serverSideQuery: true,
    seniorityFilter: false,
    salaryData: false,
    requiresAuth: false,
  }

  async search(criteria: SearchCriteria): Promise<Job[]> {
    const jobs: Job[] = []

    for (const query of allQueries(criteria)) {
      try {
        const html = await fetchText(buildSearchUrl(query, criteria), {
          accept: 'text/html,application/xhtml+xml',
        })
        jobs.push(...parseGuestCards(html, criteria.remote === 'required'))
      } catch {
        // One throttled or failed query must not discard the queries that
        // already succeeded. The run reports whatever this source did return.
      }
      await delay(PAUSE_MS)
    }
    return jobs
  }
}
