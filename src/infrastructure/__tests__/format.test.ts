import { describe, expect, it } from 'vitest'
import { ageFilterLabel } from '@infra/report/format'

const NOW = new Date('2026-08-21T16:37:00Z')
const MS_PER_DAY = 86_400_000

/** Mirrors how the CLI turns --since into a day count. */
function daysSince(isoDate: string): number {
  return (NOW.getTime() - new Date(`${isoDate}T00:00:00Z`).getTime()) / MS_PER_DAY
}

describe('ageFilterLabel', () => {
  // --since 2026-08-19 yields 2.69 days. The fraction must not reach the report,
  // and the round trip back to a date must land on the day the user asked for.
  it('round-trips a --since date instead of printing a fraction', () => {
    expect(ageFilterLabel(daysSince('2026-08-19'), NOW)).toBe('desde 2026-08-19 (~3 días)')
  })

  it('round-trips a single-day --since', () => {
    expect(ageFilterLabel(daysSince('2026-08-21'), NOW)).toBe('desde 2026-08-21 (~1 día)')
  })

  it('uses the singular for a whole single day', () => {
    expect(ageFilterLabel(1, NOW)).toBe('desde 2026-08-20 (~1 día)')
  })

  it('handles whole-day filters from --max-age', () => {
    expect(ageFilterLabel(7, NOW)).toBe('desde 2026-08-14 (~7 días)')
  })
})
