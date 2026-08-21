import { describe, expect, it } from 'vitest'
import { evaluate, rankJobs, WEIGHTS } from '@domain/Scorer'
import { NOW, aJob, daysAgo, mobileCriteria } from './fixtures'

const criteria = mobileCriteria()

describe('evaluate — hard rejections', () => {
  it('rejects excluded titles', () => {
    const result = evaluate(aJob({ title: 'Junior iOS Developer' }), criteria, NOW)
    expect(result.rejected).toBe('excluded-title')
  })

  it('rejects offers that match no required term', () => {
    const result = evaluate(
      aJob({ title: 'Auxiliar de Almacen e Inventarios', description: 'Gestion de stock.' }),
      criteria,
      NOW,
    )
    expect(result.rejected).toBe('off-target')
  })

  it('rejects offers whose published salary is below the floor', () => {
    const result = evaluate(aJob({ salaryUsdPerMonth: 1500 }), criteria, NOW)
    expect(result.rejected).toBe('below-salary-floor')
  })

  it('keeps offers with an unknown salary under the keep policy', () => {
    const result = evaluate(aJob({ salaryUsdPerMonth: null }), criteria, NOW)
    expect(result.rejected).toBeNull()
  })

  it('drops offers with an unknown salary under the drop policy', () => {
    const strict = mobileCriteria({ salaryUnknownPolicy: 'drop' })
    const result = evaluate(aJob({ salaryUsdPerMonth: null }), strict, NOW)
    expect(result.rejected).toBe('salary-unknown')
  })

  it('rejects non-remote offers when remote is required', () => {
    const result = evaluate(aJob({ remote: false }), criteria, NOW)
    expect(result.rejected).toBe('not-remote')
  })

  it('does not reject a strong on-target offer', () => {
    const result = evaluate(
      aJob({ title: 'Senior iOS Engineer', description: 'Swift, SwiftUI, offline-first.' }),
      criteria,
      NOW,
    )
    expect(result.rejected).toBeNull()
    expect(result.score).toBeGreaterThan(0)
  })
})

describe('evaluate — scoring', () => {
  it('scores expert stack matches above working-tier matches', () => {
    const expert = evaluate(
      aJob({ title: 'iOS Engineer', description: 'Swift, SwiftUI, UIKit, Combine, Core Data.' }),
      criteria,
      NOW,
    )
    const working = evaluate(
      aJob({ title: 'Mobile Engineer', description: 'Flutter, Docker and AWS.' }),
      criteria,
      NOW,
    )
    expect(expert.breakdown.stack).toBeGreaterThan(working.breakdown.stack)
  })

  it('scores matching seniority above unstated seniority', () => {
    const senior = evaluate(aJob({ title: 'Senior iOS Engineer' }), criteria, NOW)
    const plain = evaluate(aJob({ title: 'iOS Engineer' }), criteria, NOW)
    expect(senior.breakdown.seniority).toBeGreaterThan(plain.breakdown.seniority)
  })

  it('scores recent offers above stale ones', () => {
    const fresh = evaluate(aJob({ publishedAt: daysAgo(1) }), criteria, NOW)
    const stale = evaluate(aJob({ publishedAt: daysAgo(90) }), criteria, NOW)
    expect(fresh.breakdown.recency).toBeGreaterThan(stale.breakdown.recency)
  })

  it('reports which stack terms matched, for the report', () => {
    const result = evaluate(
      aJob({ description: 'Swift, SwiftUI and Fastlane pipelines.' }),
      criteria,
      NOW,
    )
    expect(result.matchedStack).toEqual(expect.arrayContaining(['swift', 'swiftui', 'fastlane']))
  })

  it('never returns a score outside 0..100', () => {
    const everything = evaluate(
      aJob({
        title: 'Staff iOS Engineer',
        description: 'Swift SwiftUI UIKit Combine Core Data VIPER MVVM Kotlin React Native GraphQL offline-first Fastlane Flutter Docker AWS',
        salaryUsdPerMonth: 12_000,
        publishedAt: NOW,
      }),
      criteria,
      NOW,
    )
    expect(everything.score).toBeGreaterThanOrEqual(0)
    expect(everything.score).toBeLessThanOrEqual(100)
  })
})

describe('rankJobs — the source-bias bug', () => {
  // Found live: sorting by salary alone let Torre take 87 of 103 slots purely
  // because it is the only source publishing numbers. A strong Mozilla iOS role
  // with no published salary sank below weak roles that published one.
  it('ranks a strong offer without salary above a weak offer with salary', () => {
    const strongNoSalary = aJob({
      id: 'mozilla',
      title: 'Staff Software Engineer - iOS',
      description: 'Swift, SwiftUI, UIKit, Combine, Core Data, MVVM. Offline-first architecture.',
      salaryUsdPerMonth: null,
      publishedAt: daysAgo(1),
    })
    const weakWithSalary = aJob({
      id: 'weak',
      title: 'Mobile Engineer',
      description: 'Flutter and Docker.',
      salaryUsdPerMonth: 4_200,
      publishedAt: daysAgo(45),
    })

    const ranked = rankJobs([weakWithSalary, strongNoSalary], criteria, NOW)

    expect(ranked[0]?.job.id).toBe('mozilla')
  })

  it('treats an unknown salary as neutral, not as zero', () => {
    const unknown = evaluate(aJob({ salaryUsdPerMonth: null }), criteria, NOW)
    const atFloor = evaluate(aJob({ salaryUsdPerMonth: 4_000 }), criteria, NOW)
    const wellPaid = evaluate(aJob({ salaryUsdPerMonth: 12_000 }), criteria, NOW)

    expect(unknown.breakdown.salary).toBeGreaterThan(atFloor.breakdown.salary)
    expect(unknown.breakdown.salary).toBeLessThan(wellPaid.breakdown.salary)
  })

  it('excludes rejected jobs from the ranking', () => {
    const ranked = rankJobs(
      [aJob({ id: 'ok' }), aJob({ id: 'nope', title: 'Junior iOS Developer' })],
      criteria,
      NOW,
    )
    expect(ranked.map((entry) => entry.job.id)).toEqual(['ok'])
  })

  it('sorts descending by score', () => {
    const ranked = rankJobs(
      [
        aJob({ id: 'a', title: 'Mobile Engineer', description: 'Flutter.' }),
        aJob({ id: 'b', title: 'Senior iOS Engineer', description: 'Swift SwiftUI UIKit Combine.' }),
      ],
      criteria,
      NOW,
    )
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score)
  })
})

describe('evaluate — the English-word false positive', () => {
  // Found live: "Watchmaker" (Seiko) and "Handyperson" scored 63 in an iOS
  // search because English prose contains "swift" (fast) and "combine".
  // The mobile signal must come from the title or the tags, never from prose.
  it('rejects an offer whose only signal is an English word in the body', () => {
    const watchmaker = aJob({
      title: 'Watchmaker',
      tags: ['manufacturing'],
      description: 'We need swift turnaround and the ability to combine precision with care.',
    })
    expect(evaluate(watchmaker, criteria, NOW).rejected).toBe('off-target')
  })

  it('rejects a handyperson role that mentions swift service', () => {
    const handyperson = aJob({
      title: 'Handyperson',
      tags: [],
      description: 'Provide swift maintenance and rest breaks coverage.',
    })
    expect(evaluate(handyperson, criteria, NOW).rejected).toBe('off-target')
  })

  it('accepts an offer whose signal is in the title', () => {
    const real = aJob({ title: 'Senior iOS Engineer', tags: [], description: 'Great team.' })
    expect(evaluate(real, criteria, NOW).rejected).toBeNull()
  })

  it('accepts an offer whose signal is in the tags', () => {
    const tagged = aJob({ title: 'Software Engineer', tags: ['kotlin', 'backend'], description: 'Fun.' })
    expect(evaluate(tagged, criteria, NOW).rejected).toBeNull()
  })
})

describe('evaluate — age filter', () => {
  it('rejects offers older than the allowed age', () => {
    const fresh = mobileCriteria({ maxAgeDays: 2 })
    const result = evaluate(aJob({ publishedAt: daysAgo(5) }), fresh, NOW)
    expect(result.rejected).toBe('too-old')
  })

  it('keeps offers inside the allowed age', () => {
    const fresh = mobileCriteria({ maxAgeDays: 2 })
    expect(evaluate(aJob({ publishedAt: daysAgo(1) }), fresh, NOW).rejected).toBeNull()
  })

  it('treats the boundary as inclusive', () => {
    const fresh = mobileCriteria({ maxAgeDays: 2 })
    expect(evaluate(aJob({ publishedAt: daysAgo(2) }), fresh, NOW).rejected).toBeNull()
  })

  it('applies no age filter when maxAgeDays is null', () => {
    const any = mobileCriteria({ maxAgeDays: null })
    expect(evaluate(aJob({ publishedAt: daysAgo(400) }), any, NOW).rejected).toBeNull()
  })

  // Measured across all five sources: zero offers arrived without a date.
  // The policy exists so a source that stops publishing dates fails loudly
  // by configuration, not silently by omission.
  it('keeps undated offers under the keep policy', () => {
    const fresh = mobileCriteria({ maxAgeDays: 2, unknownDatePolicy: 'keep' })
    expect(evaluate(aJob({ publishedAt: null }), fresh, NOW).rejected).toBeNull()
  })

  it('drops undated offers under the drop policy', () => {
    const strict = mobileCriteria({ maxAgeDays: 2, unknownDatePolicy: 'drop' })
    expect(evaluate(aJob({ publishedAt: null }), strict, NOW).rejected).toBe('date-unknown')
  })

  it('ignores the unknown-date policy when no age filter is set', () => {
    const strict = mobileCriteria({ maxAgeDays: null, unknownDatePolicy: 'drop' })
    expect(evaluate(aJob({ publishedAt: null }), strict, NOW).rejected).toBeNull()
  })
})

describe('evaluate — location filter', () => {
  // Live runs put Townsville, Brisbane, Adelaide, Cairns, Chennai and Kyiv in
  // the ranking with no filtering at all: `zones` was a scoring bonus only.
  it('rejects a posting scoped to an unreachable place under the balanced policy', () => {
    const result = evaluate(aJob({ location: 'Townsville, ' }), criteria, NOW)
    expect(result.rejected).toBe('location-mismatch')
  })

  it('keeps a posting that names no place under the balanced policy', () => {
    const result = evaluate(aJob({ location: null }), criteria, NOW)
    expect(result.rejected).toBeNull()
  })

  it('drops a posting that names no place under the strict policy', () => {
    const strict = mobileCriteria({ locationPolicy: 'strict' })
    expect(evaluate(aJob({ location: null }), strict, NOW).rejected).toBe('location-mismatch')
  })

  it('keeps everything under the off policy', () => {
    const off = mobileCriteria({ locationPolicy: 'off' })
    expect(evaluate(aJob({ location: 'Chennai' }), off, NOW).rejected).toBeNull()
  })

  it('keeps a LATAM posting', () => {
    expect(evaluate(aJob({ location: 'Peru' }), criteria, NOW).rejected).toBeNull()
    expect(evaluate(aJob({ location: 'Colombia' }), criteria, NOW).rejected).toBeNull()
  })

  it('scores a reachable posting above one that names no place', () => {
    const match = evaluate(aJob({ location: 'Peru' }), criteria, NOW)
    const unknown = evaluate(aJob({ location: null }), criteria, NOW)
    expect(match.breakdown.location).toBeGreaterThan(unknown.breakdown.location)
  })

  it('gives an unreachable posting no location credit under the off policy', () => {
    const off = mobileCriteria({ locationPolicy: 'off' })
    expect(evaluate(aJob({ location: 'Chennai' }), off, NOW).breakdown.location).toBe(0)
  })
})

describe('evaluate — salary floor and salary target are separate concerns', () => {
  // min_salary_usd is the filter threshold; salary_target_usd is where the
  // score saturates. One number doing both jobs meant that lowering the floor
  // to widen coverage silently flattened the ranking.
  const tiered = mobileCriteria({ minSalaryUsd: 1000, salaryTargetUsd: 8000 })

  it('awards full salary credit at the target', () => {
    const atTarget = evaluate(aJob({ salaryUsdPerMonth: 8000 }), tiered, NOW)
    expect(atTarget.breakdown.salary).toBe(WEIGHTS.salary)
  })

  it('awards full salary credit above the target', () => {
    const above = evaluate(aJob({ salaryUsdPerMonth: 20_000 }), tiered, NOW)
    expect(above.breakdown.salary).toBe(WEIGHTS.salary)
  })

  it('still discriminates between offers under the target', () => {
    const mid = evaluate(aJob({ salaryUsdPerMonth: 4_000 }), tiered, NOW)
    const high = evaluate(aJob({ salaryUsdPerMonth: 7_000 }), tiered, NOW)
    expect(high.breakdown.salary).toBeGreaterThan(mid.breakdown.salary)
  })

  it('keeps an unknown salary between the floor and the target', () => {
    const floor = evaluate(aJob({ salaryUsdPerMonth: 1_000 }), tiered, NOW)
    const unknown = evaluate(aJob({ salaryUsdPerMonth: null }), tiered, NOW)
    const target = evaluate(aJob({ salaryUsdPerMonth: 8_000 }), tiered, NOW)
    expect(unknown.breakdown.salary).toBeGreaterThan(floor.breakdown.salary)
    expect(unknown.breakdown.salary).toBeLessThan(target.breakdown.salary)
  })

  it('lowering the floor no longer flattens the top of the curve', () => {
    const lowFloor = mobileCriteria({ minSalaryUsd: 1000, salaryTargetUsd: 8000 })
    const four = evaluate(aJob({ salaryUsdPerMonth: 4_000 }), lowFloor, NOW)
    const fifteen = evaluate(aJob({ salaryUsdPerMonth: 15_000 }), lowFloor, NOW)
    expect(fifteen.breakdown.salary).toBeGreaterThan(four.breakdown.salary)
  })

  it('falls back to a multiple of the floor when no target is set', () => {
    const noTarget = mobileCriteria({ minSalaryUsd: 4000, salaryTargetUsd: null })
    const atFloor = evaluate(aJob({ salaryUsdPerMonth: 4_000 }), noTarget, NOW)
    const atCap = evaluate(aJob({ salaryUsdPerMonth: 16_000 }), noTarget, NOW)
    expect(atFloor.breakdown.salary).toBeLessThan(atCap.breakdown.salary)
    expect(atCap.breakdown.salary).toBe(WEIGHTS.salary)
  })
})
