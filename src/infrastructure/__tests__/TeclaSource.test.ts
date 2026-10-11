import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeclaSource, mapTeclaJobs } from '@infra/sources/TeclaSource'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { assessEligibility } from '@domain/Location'
import { mobileCriteria } from '@domain/__tests__/fixtures'

const page = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/tecla-public-jobs.json', import.meta.url)),
    'utf8',
  ),
) as { data: { jobs: unknown[] } }

describe('mapTeclaJobs', () => {
  const jobs = mapTeclaJobs(page.data.jobs)

  it('maps every job and tags it with the tecla source', () => {
    expect(jobs).toHaveLength(3)
    expect(jobs.every((j) => j.source === 'tecla')).toBe(true)
  })

  it('maps title, company, skills and commitment', () => {
    const [first] = jobs
    expect(first?.title).toBe('Data Engineer')
    expect(first?.company).toBe('Fabletics')
    expect(first?.tags).toEqual(expect.arrayContaining(['SQL', 'Python', 'Full-Time']))
  })

  // The listing links to /job?id=<id>. canonicalUrl would strip the query and
  // collapse every job into one, so the id must stay distinct per job.
  it('links to the public job page and keeps a distinct id per job', () => {
    expect(jobs[0]?.url).toBe('https://app.tecla.io/job?id=3332')
    expect(new Set(jobs.map((j) => j.id)).size).toBe(3)
  })

  it('keeps ids stable across runs', () => {
    expect(mapTeclaJobs(page.data.jobs).map((j) => j.id)).toEqual(jobs.map((j) => j.id))
  })

  // The API sends no zone; the full instant proves the read is UTC in any host timezone.
  it('reads publishedAt from createdAt as a UTC instant', () => {
    expect(jobs[0]?.publishedAt?.toISOString()).toBe('2026-07-10T19:58:43.608Z')
  })

  it('treats every offer as remote', () => {
    expect(jobs.every((j) => j.remote)).toBe(true)
  })

  // Without this a US-only offer looks like an unrestricted remote job.
  it('scopes a US-only offer to the United States so the location filter can reject it', () => {
    const usOnly = jobs.find((j) => j.title === 'Lead Full-Stack Developer')
    expect(usOnly?.location).toBe('United States')
    const latamOnly = mobileCriteria({ zones: ['latam'], country: 'peru' })
    expect(usOnly && assessEligibility(usOnly, latamOnly)).toBe('conflict')
  })

  it('leaves the location open for offers that are not US-only', () => {
    expect(jobs[0]?.location).toBeNull()
  })

  it('uses the monthly salary as USD per month', () => {
    expect(jobs[0]?.salaryUsdPerMonth).toBe(3000)
    expect(jobs[0]?.salaryRaw).toBe('USD 3000-3500 monthly')
  })

  it('converts an annual salary to a monthly figure', () => {
    expect(jobs[2]?.salaryUsdPerMonth).toBe(12500)
    expect(jobs[2]?.salaryRaw).toBe('USD 150000-180000 annual')
  })

  it('keeps hourly rates as raw text without inventing a monthly figure', () => {
    expect(jobs[1]?.salaryUsdPerMonth).toBeNull()
    expect(jobs[1]?.salaryRaw).toBe('USD 40-50 hourly')
  })

  it('skips entries without an id or a name and tolerates non-arrays', () => {
    expect(mapTeclaJobs([{ name: 'No id' }, { id: 1 }])).toEqual([])
    expect(mapTeclaJobs(undefined)).toEqual([])
  })

  it('skips null and primitive elements instead of failing the whole page', () => {
    const mixed = [null, 7, 'text', undefined, ...page.data.jobs]
    expect(mapTeclaJobs(mixed)).toHaveLength(3)
  })
})

describe('TeclaSource.search', () => {
  const criteria = {} as SearchCriteria

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function envelope(jobs: unknown[], current: number, countPages: number) {
    return Response.json({
      success: true,
      data: { jobs, pagination: { count: 43, countPages, current } },
    })
  }

  async function search() {
    const pending = new TeclaSource().search(criteria)
    pending.catch(() => undefined)
    await vi.runAllTimersAsync()
    return pending
  }

  const pageOf = (input: string | URL | Request) =>
    Number(new URL(String(input)).searchParams.get('page'))

  it('walks pages with ?page=N and stops at countPages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      envelope(page.data.jobs, pageOf(input), 2),
    )
    vi.stubGlobal('fetch', fetchMock)
    const jobs = await search()
    expect(jobs).toHaveLength(6)
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://api.tecla.io/api/jobs/getPublicJobs/?page=1',
      'https://api.tecla.io/api/jobs/getPublicJobs/?page=2',
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('stops on an empty page even if countPages says otherwise', async () => {
    const fetchMock = vi.fn(async () => envelope([], 1, 5))
    vi.stubGlobal('fetch', fetchMock)
    expect(await search()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces an HTTP failure on the first page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    await expect(search()).rejects.toThrow(/500/)
  })

  it('keeps the jobs already read and warns when a later page fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        pageOf(input) === 1 ? envelope(page.data.jobs, 1, 4) : new Response('x', { status: 500 }),
      ),
    )
    const jobs = await search()
    expect(jobs).toHaveLength(3)
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('tecla')
    expect(message).toMatch(/página 2/)
    expect(message).toMatch(/500/)
  })

  it('warns when MAX_PAGES is reached while the API reports more pages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      envelope(page.data.jobs, pageOf(input), 25),
    )
    vi.stubGlobal('fetch', fetchMock)
    const jobs = await search()
    expect(fetchMock).toHaveBeenCalledTimes(10)
    expect(jobs).toHaveLength(30)
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('tecla')
    expect(message).toMatch(/10 de 25/)
  })
})
