import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeverSource, mapLeverPostings } from '@infra/sources/LeverSource'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { assessEligibility } from '@domain/Location'
import { mobileCriteria } from '@domain/__tests__/fixtures'

const postings = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/lever-coderio.json', import.meta.url)),
    'utf8',
  ),
) as unknown[]

describe('mapLeverPostings', () => {
  it('maps every posting and tags it with the lever source', () => {
    const jobs = mapLeverPostings(postings, 'coderio')
    expect(jobs).toHaveLength(3)
    expect(jobs.every((j) => j.source === 'lever')).toBe(true)
  })

  it('uses the hosted URL and the board slug as the company', () => {
    const [first] = mapLeverPostings(postings, 'coderio')
    expect(first?.title).toBe('Sr AWS Data Architect')
    expect(first?.company).toBe('coderio')
    expect(first?.url).toBe(
      'https://jobs.lever.co/coderio/bfa73046-169e-4721-a54a-e17db64092ac',
    )
  })

  it('reads publishedAt from createdAt in epoch milliseconds', () => {
    const [first] = mapLeverPostings(postings, 'coderio')
    expect(first?.publishedAt?.getTime()).toBe(
      (postings[0] as { createdAt: number }).createdAt,
    )
  })

  it('derives remote from workplaceType', () => {
    const [remote, onsite, hybrid] = mapLeverPostings(postings, 'coderio')
    expect(remote?.remote).toBe(true)
    expect(onsite?.remote).toBe(false)
    expect(hybrid?.remote).toBe(false)
  })

  it('lists every location the posting is open to, falling back to the category and the country', () => {
    const [first, second] = mapLeverPostings(postings, 'coderio')
    expect(first?.location).toBe('Colombia, México, Argentina, Peru, Ecuador')
    expect(second?.location).toBe('Miami, Florida')
    const onlyCategory = [{ ...(postings[0] as object), categories: { location: 'Colombia' } }]
    expect(mapLeverPostings(onlyCategory, 'coderio')[0]?.location).toBe('Colombia')
    const noCategory = [{ ...(postings[0] as object), categories: {}, country: 'CO' }]
    expect(mapLeverPostings(noCategory, 'coderio')[0]?.location).toBe('CO')
  })

  // The primary location alone would scope this posting to Colombia.
  it('keeps a posting open to the candidate country eligible when that country is required', () => {
    const [first] = mapLeverPostings(postings, 'coderio')
    const peruRequired = mobileCriteria({ zones: ['latam'], country: 'peru', requireCountry: true })
    expect(first && assessEligibility(first, peruRequired)).toBe('match')
  })

  // Lever's range is a placeholder (min 1) or zero when the company publishes nothing.
  it('reports no salary for zero, placeholder or missing ranges', () => {
    for (const job of mapLeverPostings(postings, 'coderio')) {
      expect(job.salaryUsdPerMonth).toBeNull()
      expect(job.salaryRaw).toBeNull()
    }
  })

  it('normalizes a real monthly or yearly USD range to USD per month', () => {
    const base = postings[0] as object
    const monthly = [
      { ...base, salaryRange: { min: 4000, max: 6000, currency: 'USD', interval: 'per-month-salary' } },
    ]
    const yearly = [
      { ...base, salaryRange: { min: 60000, max: 90000, currency: 'USD', interval: 'per-year-salary' } },
    ]
    const [m] = mapLeverPostings(monthly, 'coderio')
    const [y] = mapLeverPostings(yearly, 'coderio')
    expect(m?.salaryUsdPerMonth).toBe(4000)
    expect(m?.salaryRaw).toBe('USD 4000-6000 per-month-salary')
    expect(y?.salaryUsdPerMonth).toBe(5000)
  })

  it('keeps the raw salary but no normalized value for non-USD ranges', () => {
    const eur = [
      { ...(postings[0] as object), salaryRange: { min: 4000, max: 6000, currency: 'EUR', interval: 'per-month-salary' } },
    ]
    const [job] = mapLeverPostings(eur, 'coderio')
    expect(job?.salaryUsdPerMonth).toBeNull()
    expect(job?.salaryRaw).toBe('EUR 4000-6000 per-month-salary')
  })

  // Recorded and live postings carry the same text in both fields (15 of 15 checked).
  it('does not repeat a description that both fields carry', () => {
    const same = [{ ...(postings[1] as object), descriptionPlain: 'Build apps.', descriptionBodyPlain: 'Build apps.', additionalPlain: 'Perks.' }]
    expect(mapLeverPostings(same, 'coderio')[0]?.description).toBe('Build apps.\nPerks.')
  })

  it('keeps one field when it contains the other, and both when they differ', () => {
    const base = postings[1] as object
    const nested = [{ ...base, descriptionPlain: 'Intro. Build apps.', descriptionBodyPlain: 'Build apps.' }]
    expect(mapLeverPostings(nested, 'coderio')[0]?.description).toBe('Intro. Build apps.')
    const differ = [{ ...base, descriptionPlain: 'Intro.', descriptionBodyPlain: 'Build apps.' }]
    expect(mapLeverPostings(differ, 'coderio')[0]?.description).toBe('Intro.\nBuild apps.')
  })

  it('skips null and primitive elements instead of failing the whole board', () => {
    expect(mapLeverPostings([null, 7, 'text', ...postings], 'coderio')).toHaveLength(3)
  })

  it('skips postings without a title or URL and tolerates non-arrays', () => {
    expect(mapLeverPostings([{ id: 'x' }, { text: 'No url' }], 'coderio')).toEqual([])
    expect(mapLeverPostings(null, 'coderio')).toEqual([])
  })
})

describe('LeverSource.search', () => {
  const criteria = {} as SearchCriteria

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function stubFetch(handler: (url: string) => Response) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => handler(String(input)))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('queries the coderio board by default', async () => {
    const fetchMock = stubFetch(() => Response.json(postings))
    const jobs = await new LeverSource().search(criteria)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.lever.co/v0/postings/coderio?mode=json')
    expect(jobs).toHaveLength(3)
  })

  it('merges several boards and keeps the results of the ones that work', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    stubFetch((url) =>
      url.includes('/broken?') ? new Response('nope', { status: 404 }) : Response.json(postings),
    )
    const jobs = await new LeverSource(['one', 'broken', 'two']).search(criteria)
    expect(jobs).toHaveLength(6)
    expect(new Set(jobs.map((j) => j.company))).toEqual(new Set(['one', 'two']))
  })

  it('warns which boards failed and why when others succeed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    stubFetch((url) =>
      url.includes('/broken?') ? new Response('nope', { status: 404 }) : Response.json(postings),
    )
    await new LeverSource(['one', 'broken', 'two']).search(criteria)
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('lever')
    expect(message).toContain('broken')
    expect(message).toMatch(/404/)
    expect(message).not.toContain('one')
  })

  it('does not warn when every board works', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    stubFetch(() => Response.json(postings))
    await new LeverSource(['one', 'two']).search(criteria)
    expect(warn).not.toHaveBeenCalled()
  })

  it('throws when every board fails, so the failure is reported', async () => {
    stubFetch(() => new Response('nope', { status: 404 }))
    await expect(new LeverSource(['a', 'b']).search(criteria)).rejects.toThrow(/404/)
  })
})
