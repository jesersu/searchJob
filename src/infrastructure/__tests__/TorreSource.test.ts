import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TorreSource } from '@infra/sources/TorreSource'
import { mobileCriteria } from '@domain/__tests__/fixtures'

const entry = {
  id: 'abc123',
  objective: 'Senior iOS Engineer',
  organizations: [{ name: 'Acme' }],
  remote: true,
  locations: ['Peru'],
  skills: [{ name: 'Swift' }],
  created: '2026-10-08T12:00:00.000Z',
}

describe('TorreSource.search', () => {
  const criteria = mobileCriteria({ queries: { primary: ['ios developer'], secondary: [] } })

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function stubFetch(response: () => Response) {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response())
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  async function search() {
    const pending = new TorreSource().search(criteria)
    await vi.runAllTimersAsync()
    return pending
  }

  it('identifies itself with the only User-Agent the search endpoint accepts', async () => {
    const fetchMock = stubFetch(() => Response.json({ results: [] }))
    await search()
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('Torre-heda')
  })

  it('posts the query to the opportunities search endpoint', async () => {
    const fetchMock = stubFetch(() => Response.json({ results: [] }))
    await search()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('https://search.torre.co/opportunities/_search/?size=20')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      'skill/role': { text: 'ios developer', experience: 'potential-to-develop' },
    })
  })

  it('maps an opportunity to a job', async () => {
    stubFetch(() => Response.json({ results: [entry] }))
    const [job] = await search()
    expect(job).toMatchObject({
      source: 'torre',
      title: 'Senior iOS Engineer',
      company: 'Acme',
      url: 'https://torre.ai/post/abc123',
      remote: true,
      location: 'Peru',
    })
  })

  it('skips entries without an id or a title', async () => {
    stubFetch(() => Response.json({ results: [{ id: 'x' }, { objective: 'No id' }, entry] }))
    expect(await search()).toHaveLength(1)
  })
})
