import type { Job } from '@domain/Job'
import type { JobSource, SourceCapabilities } from '@domain/ports/JobSource'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { fetchText } from '../http.js'
import { buildJob, stripHtml, toDate } from './support.js'

const FEED = 'https://weworkremotely.com/categories/remote-programming-jobs.rss'

const ITEM_PATTERN = /<item>([\s\S]*?)<\/item>/g

function tag(block: string, name: string): string {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)
  if (!match?.[1]) return ''
  return match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
}

/** Feed titles arrive as "Company: Position". */
function splitTitle(raw: string): { company: string; title: string } {
  const separator = raw.indexOf(':')
  if (separator === -1) return { company: 'unknown', title: raw }
  return {
    company: raw.slice(0, separator).trim(),
    title: raw.slice(separator + 1).trim(),
  }
}

/** RSS only, one fixed category. All filtering happens in the domain. */
export class WeWorkRemotelySource implements JobSource {
  readonly id = 'weworkremotely'
  readonly capabilities: SourceCapabilities = {
    serverSideQuery: false,
    seniorityFilter: false,
    salaryData: false,
    requiresAuth: false,
  }

  async search(_criteria: SearchCriteria): Promise<Job[]> {
    const xml = await fetchText(FEED)
    const jobs: Job[] = []

    for (const match of xml.matchAll(ITEM_PATTERN)) {
      const block = match[1] ?? ''
      const link = tag(block, 'link')
      const rawTitle = tag(block, 'title')
      if (!link || !rawTitle) continue

      const { company, title } = splitTitle(rawTitle)
      const region = tag(block, 'region')

      jobs.push(
        buildJob({
          source: this.id,
          title,
          company,
          url: link,
          description: stripHtml(tag(block, 'description')),
          tags: region ? [region] : [],
          salaryUsdPerMonth: null,
          salaryRaw: null,
          remote: true,
          location: region || null,
          publishedAt: toDate(tag(block, 'pubDate')),
        }),
      )
    }
    return jobs
  }
}
