import { describe, expect, it } from 'vitest'
import { assessEligibility } from '@domain/Location'
import { aJob, mobileCriteria } from './fixtures'

const criteria = mobileCriteria({ country: 'peru', zones: ['latam', 'americas', 'global'] })

describe('assessEligibility — conflicts', () => {
  // Every one of these appeared in a live run and ranked as if it were reachable.
  it('flags an Australian city in the location field', () => {
    expect(assessEligibility(aJob({ location: 'Townsville, ' }), criteria)).toBe('conflict')
    expect(assessEligibility(aJob({ location: 'Brisbane, ' }), criteria)).toBe('conflict')
    expect(assessEligibility(aJob({ location: 'Adelaide, ' }), criteria)).toBe('conflict')
  })

  it('flags a country outside the allowed zones', () => {
    expect(assessEligibility(aJob({ location: 'India' }), criteria)).toBe('conflict')
    expect(assessEligibility(aJob({ location: 'Portugal' }), criteria)).toBe('conflict')
    expect(assessEligibility(aJob({ location: 'Kyiv' }), criteria)).toBe('conflict')
  })

  it('flags a country restriction stated in the title', () => {
    expect(assessEligibility(aJob({ title: 'iOS Developer (Nigeria)' }), criteria)).toBe('conflict')
    expect(
      assessEligibility(aJob({ title: 'Senior iOS Developer - Remote Portugal' }), criteria),
    ).toBe('conflict')
  })
})

describe('assessEligibility — matches', () => {
  it('accepts the candidate own country', () => {
    expect(assessEligibility(aJob({ location: 'Peru' }), criteria)).toBe('match')
  })

  it('accepts other LATAM countries', () => {
    expect(assessEligibility(aJob({ location: 'Colombia' }), criteria)).toBe('match')
    expect(assessEligibility(aJob({ location: 'Argentina' }), criteria)).toBe('match')
  })

  // US companies routinely hire LATAM contractors; "americas" covers this.
  it('accepts the United States under the americas zone', () => {
    expect(assessEligibility(aJob({ location: 'United States' }), criteria)).toBe('match')
  })

  it('accepts worldwide postings', () => {
    expect(assessEligibility(aJob({ description: 'Fully remote, worldwide.' }), criteria)).toBe('match')
    expect(assessEligibility(aJob({ location: 'Anywhere' }), criteria)).toBe('match')
  })

  it('lets an allowed region win over an excluded one in the same posting', () => {
    const job = aJob({ title: 'Senior iOS Engineer (LATAM/Canada)', location: 'Portugal' })
    expect(assessEligibility(job, criteria)).toBe('match')
  })
})

describe('assessEligibility — unknown', () => {
  it('returns unknown when the posting names no place at all', () => {
    const job = aJob({ title: 'Senior iOS Engineer', location: null, description: 'Swift work.' })
    expect(assessEligibility(job, criteria)).toBe('unknown')
  })

  it('returns unknown for an empty location string', () => {
    expect(assessEligibility(aJob({ location: '   ' }), criteria)).toBe('unknown')
  })
})

describe('assessEligibility — zone configuration', () => {
  it('treats the United States as a conflict when americas is not allowed', () => {
    const latamOnly = mobileCriteria({ country: 'peru', zones: ['latam'] })
    expect(assessEligibility(aJob({ location: 'United States' }), latamOnly)).toBe('conflict')
  })

  it('returns unknown for every posting when no country or zone is configured', () => {
    const open = mobileCriteria({ country: null, zones: [] })
    expect(assessEligibility(aJob({ location: 'India' }), open)).toBe('unknown')
  })
})

describe('assessEligibility — where the allowed signal appears matters', () => {
  // Found live: a Surveyor in "Mackay, " (Australia) scored as reachable
  // because its body happened to name an allowed place. A body mention is
  // background; the location field is the posting's actual scope.
  it('lets a location conflict outrank an allowed term found only in the body', () => {
    const job = aJob({
      title: 'Surveyor',
      location: 'Mackay, ',
      description: 'We serve clients across the americas and worldwide markets.',
    })
    expect(assessEligibility(job, criteria)).toBe('conflict')
  })

  it('still accepts an allowed term in the title over a location conflict', () => {
    const job = aJob({ title: 'Senior iOS Engineer (LATAM/Canada)', location: 'Portugal' })
    expect(assessEligibility(job, criteria)).toBe('match')
  })

  it('accepts an allowed term found only in the body when nothing conflicts', () => {
    const job = aJob({ location: null, description: 'Fully remote, worldwide.' })
    expect(assessEligibility(job, criteria)).toBe('match')
  })
})

describe('assessEligibility — requireCountry', () => {
  const strictCountry = mobileCriteria({
    country: 'peru',
    zones: ['latam', 'americas', 'global'],
    requireCountry: true,
  })

  it('rejects a posting scoped to another country inside an allowed zone', () => {
    expect(assessEligibility(aJob({ location: 'Colombia' }), strictCountry)).toBe('conflict')
    expect(assessEligibility(aJob({ location: 'Argentina' }), strictCountry)).toBe('conflict')
    expect(assessEligibility(aJob({ location: 'United States' }), strictCountry)).toBe('conflict')
  })

  it('accepts the candidate own country', () => {
    expect(assessEligibility(aJob({ location: 'Peru' }), strictCountry)).toBe('match')
    expect(assessEligibility(aJob({ location: 'Lima, Peru' }), strictCountry)).toBe('match')
  })

  // A region covers Peru by definition, so it stays eligible.
  it('accepts a posting scoped to a region rather than a country list', () => {
    expect(assessEligibility(aJob({ title: 'iOS Engineer (LATAM)' }), strictCountry)).toBe('match')
    expect(assessEligibility(aJob({ location: 'Latin America' }), strictCountry)).toBe('match')
    expect(assessEligibility(aJob({ location: 'Anywhere' }), strictCountry)).toBe('match')
  })

  it('accepts a country list that names Peru among others', () => {
    const job = aJob({ title: 'iOS Engineer (Colombia, Peru, Mexico)' })
    expect(assessEligibility(job, strictCountry)).toBe('match')
  })

  it('leaves a posting that names no place as unknown', () => {
    const job = aJob({ title: 'Senior iOS Engineer', location: null, description: 'Swift.' })
    expect(assessEligibility(job, strictCountry)).toBe('unknown')
  })

  it('does not change behaviour when disabled', () => {
    const relaxed = mobileCriteria({ country: 'peru', zones: ['latam'], requireCountry: false })
    expect(assessEligibility(aJob({ location: 'Colombia' }), relaxed)).toBe('match')
  })

  it('needs a country to be configured at all', () => {
    const noCountry = mobileCriteria({ country: null, zones: ['latam'], requireCountry: true })
    expect(assessEligibility(aJob({ location: 'Colombia' }), noCountry)).toBe('match')
  })
})
