import { describe, expect, it } from 'vitest'
import { buildSearchUrl, SECONDS_PER_DAY } from '@infra/sources/LinkedInGuestSource'
import { mobileCriteria } from '@domain/__tests__/fixtures'

describe('buildSearchUrl — f_TPR', () => {
  // Verified against the live endpoint: without f_TPR, results ranged over
  // three weeks; with f_TPR=r259200 every card fell within the last 3 days.
  // LinkedIn does the filtering, so this source stops fetching offers the
  // domain would discard anyway.
  it('sends f_TPR in seconds when maxAgeDays is set', () => {
    const url = buildSearchUrl('ios engineer', mobileCriteria({ maxAgeDays: 3 }))
    const seconds = new URL(url).searchParams.get('f_TPR')
    expect(seconds).toBe(`r${3 * SECONDS_PER_DAY}`)
  })

  it('omits f_TPR when no age filter is set', () => {
    const url = buildSearchUrl('ios engineer', mobileCriteria({ maxAgeDays: null }))
    expect(new URL(url).searchParams.has('f_TPR')).toBe(false)
  })

  it('rounds up a fractional age budget, matching --since semantics', () => {
    // --since produces a fractional day count. Rounding down would ask
    // LinkedIn for a narrower window than the domain filter actually allows.
    const url = buildSearchUrl('ios engineer', mobileCriteria({ maxAgeDays: 2.69 }))
    const seconds = new URL(url).searchParams.get('f_TPR')
    expect(seconds).toBe(`r${3 * SECONDS_PER_DAY}`)
  })

  it('still applies location and remote filters alongside f_TPR', () => {
    const url = buildSearchUrl(
      'ios engineer',
      mobileCriteria({ maxAgeDays: 7, country: 'peru', remote: 'required' }),
    )
    const params = new URL(url).searchParams
    expect(params.get('location')).toBe('peru')
    expect(params.get('f_WT')).toBe('2')
    expect(params.get('f_TPR')).toBe(`r${7 * SECONDS_PER_DAY}`)
  })
})
