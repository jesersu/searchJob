import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeclaSource, mapTeclaJobs } from '@infra/sources/TeclaSource'
import type { SearchCriteria } from '@domain/SearchCriteria'

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

  it('reads publishedAt from createdAt', () => {
    expect(jobs[0]?.publishedAt?.toISOString().slice(0, 10)).toBe('2026-07-10')
  })

  it('treats every offer as remote', () => {
    expect(jobs.every((j) => j.remote)).toBe(true)
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
})

describe('TeclaSource.search', () => {
  const criteria = {} as SearchCriteria

  afterEach(() => vi.unstubAllGlobals())

  function envelope(jobs: unknown[], current: number, countPages: number) {
    return Response.json({
      success: true,
      data: { jobs, pagination: { count: 43, countPages, current } },
    })
  }

  it('walks pages with ?page=N until countPages', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const current = Number(new URL(String(input)).searchParams.get('page'))
      return envelope(current === 1 ? page.data.jobs : [], current, 2)
    })
    vi.stubGlobal('fetch', fetchMock)
    const jobs = await new TeclaSource().search(criteria)
    expect(jobs).toHaveLength(3)
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://api.tecla.io/api/jobs/getPublicJobs/?page=1',
      'https://api.tecla.io/api/jobs/getPublicJobs/?page=2',
    ])
  })

  it('stops on an empty page even if countPages says otherwise', async () => {
    const fetchMock = vi.fn(async () => envelope([], 1, 5))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new TeclaSource().search(criteria)).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    await expect(new TeclaSource().search(criteria)).rejects.toThrow(/500/)
  })
})
