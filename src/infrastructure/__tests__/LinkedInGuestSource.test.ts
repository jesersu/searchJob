import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseGuestCards } from '@infra/sources/LinkedInGuestSource'

const html = readFileSync(
  fileURLToPath(new URL('./fixtures/linkedin-guest.html', import.meta.url)),
  'utf8',
)

describe('parseGuestCards', () => {
  it('parses every card in the response', () => {
    expect(parseGuestCards(html, true)).toHaveLength(2)
  })

  it('decodes HTML entities in the title', () => {
    const [first] = parseGuestCards(html, true)
    expect(first?.title).toBe('Senior iOS & Swift Engineer - Remote Work | REF#300774')
  })

  it('extracts company, location and publication date', () => {
    const [first, second] = parseGuestCards(html, true)
    expect(first?.company).toBe('BairesDev')
    expect(first?.location).toBe('Cajamarca, Peru')
    expect(first?.publishedAt?.toISOString().slice(0, 10)).toBe('2026-08-18')
    expect(second?.publishedAt?.toISOString().slice(0, 10)).toBe('2026-08-04')
  })

  // Cards link to a country subdomain (pe.linkedin.com, br.linkedin.com) with
  // tracking parameters. Rebuilding the URL from the posting id keeps the same
  // job from being counted twice across searches.
  it('builds a canonical www URL from the posting id', () => {
    const [first] = parseGuestCards(html, true)
    expect(first?.url).toBe('https://www.linkedin.com/jobs/view/4451965065')
  })

  it('reports no salary, because guest cards publish none', () => {
    for (const job of parseGuestCards(html, true)) {
      expect(job.salaryUsdPerMonth).toBeNull()
      expect(job.salaryRaw).toBeNull()
    }
  })

  it('carries the remote flag supplied by the caller', () => {
    expect(parseGuestCards(html, true)[0]?.remote).toBe(true)
    expect(parseGuestCards(html, false)[0]?.remote).toBe(false)
  })

  it('tags every job with the linkedin source', () => {
    expect(parseGuestCards(html, true).every((j) => j.source === 'linkedin')).toBe(true)
  })

  it('returns an empty list for an empty response', () => {
    expect(parseGuestCards('', true)).toEqual([])
  })

  it('skips a malformed card instead of throwing', () => {
    expect(parseGuestCards('<li><div class="base-card"></div></li>', true)).toEqual([])
  })
})
