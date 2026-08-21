import type { Job } from './Job.js'
import { gateText, searchableText } from './Job.js'
import { contentKey } from './Identity.js'
import { assessEligibility, type Eligibility } from './Location.js'
import type { SearchCriteria, Seniority } from './SearchCriteria.js'
import { containsAnyTerm, containsTerm, matchedTerms } from './TermMatcher.js'

export type RejectReason =
  | 'excluded-title'
  | 'off-target'
  | 'excluded-stack'
  | 'not-remote'
  | 'below-salary-floor'
  | 'salary-unknown'
  | 'too-old'
  | 'date-unknown'
  | 'location-mismatch'

export interface ScoreBreakdown {
  readonly stack: number
  readonly seniority: number
  readonly salary: number
  readonly recency: number
  readonly location: number
}

export interface Evaluation {
  readonly job: Job
  readonly rejected: RejectReason | null
  readonly score: number
  readonly breakdown: ScoreBreakdown
  readonly matchedStack: readonly string[]
  readonly warnings: readonly string[]
}

/**
 * Weights sum to 100. Salary is deliberately a minor factor: most boards do not
 * publish it, and ranking by salary alone hands the entire result set to
 * whichever source happens to expose numbers.
 */
export const WEIGHTS = {
  stack: 42,
  seniority: 18,
  location: 15,
  salary: 13,
  recency: 12,
} as const

/** An unnamed location is unknown, not unreachable. Same logic as salary. */
const ELIGIBILITY_FRACTION: Readonly<Record<Eligibility, number>> = {
  match: 1,
  unknown: 0.55,
  conflict: 0,
}

const TIER_POINTS = { expert: 3, strong: 2, working: 1 } as const
/** Raw stack points that count as a full match. Beyond this it saturates. */
const STACK_SATURATION = 12

/** An unpublished salary is unknown, not bad. It sits above the floor. */
const UNKNOWN_SALARY_FRACTION = 0.55
const AT_FLOOR_SALARY_FRACTION = 0.25
/** Where the curve saturates when the role file sets no explicit target. */
const SALARY_TARGET_MULTIPLE = 4

const RECENCY_HORIZON_DAYS = 60
const UNKNOWN_RECENCY_FRACTION = 0.5
const UNSTATED_SENIORITY_FRACTION = 0.5

const ALL_SENIORITIES: readonly Seniority[] = [
  'junior',
  'mid',
  'senior',
  'staff',
  'lead',
  'principal',
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Age in whole and fractional days. Null when the source published no date. */
export function ageInDays(publishedAt: Date | null, now: Date): number | null {
  if (publishedAt === null) return null
  return (now.getTime() - publishedAt.getTime()) / MS_PER_DAY
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function stackFraction(text: string, criteria: SearchCriteria): { fraction: number; matched: string[] } {
  const matched: string[] = []
  let points = 0

  for (const [tier, weight] of Object.entries(TIER_POINTS) as [keyof typeof TIER_POINTS, number][]) {
    const hits = matchedTerms(text, criteria.stack[tier])
    matched.push(...hits)
    points += hits.length * weight
  }

  return { fraction: clamp(points / STACK_SATURATION, 0, 1), matched }
}

function seniorityFraction(text: string, criteria: SearchCriteria): number {
  const stated = ALL_SENIORITIES.filter((level) => containsTerm(text, level))
  if (stated.length === 0) return UNSTATED_SENIORITY_FRACTION

  const wanted = new Set<string>(criteria.seniority)
  return stated.some((level) => wanted.has(level)) ? 1 : 0
}

/**
 * Two distinct numbers, on purpose.
 *
 * `minSalaryUsd` is the filter threshold: below it, the offer is discarded.
 * `salaryTargetUsd` is where the score saturates. Deriving the second from the
 * first means widening coverage by lowering the floor also flattens the top of
 * the ranking, which is a change nobody asked for.
 */
function salaryFraction(job: Job, criteria: SearchCriteria): number {
  if (job.salaryUsdPerMonth === null) return UNKNOWN_SALARY_FRACTION

  const floor = criteria.minSalaryUsd
  if (floor === null || floor <= 0) return UNKNOWN_SALARY_FRACTION

  const target = criteria.salaryTargetUsd ?? floor * SALARY_TARGET_MULTIPLE
  if (target <= floor) {
    return job.salaryUsdPerMonth >= target ? 1 : AT_FLOOR_SALARY_FRACTION
  }

  const progress = (job.salaryUsdPerMonth - floor) / (target - floor)
  const headroom = 1 - AT_FLOOR_SALARY_FRACTION
  return clamp(AT_FLOOR_SALARY_FRACTION + headroom * progress, 0, 1)
}

function recencyFraction(job: Job, now: Date): number {
  if (job.publishedAt === null) return UNKNOWN_RECENCY_FRACTION

  const days = (now.getTime() - job.publishedAt.getTime()) / MS_PER_DAY
  return clamp(1 - days / RECENCY_HORIZON_DAYS, 0, 1)
}

function locationFraction(eligibility: Eligibility): number {
  return ELIGIBILITY_FRACTION[eligibility]
}

function rejectByAge(job: Job, criteria: SearchCriteria, now: Date): RejectReason | null {
  if (criteria.maxAgeDays === null) return null

  const age = ageInDays(job.publishedAt, now)
  if (age === null) {
    return criteria.unknownDatePolicy === 'drop' ? 'date-unknown' : null
  }

  // Whole days, not fractions. Sources publish a date, never a timestamp, so
  // it parses to midnight: at 19:06 a job posted during 18 Aug measures 3.8
  // days old. The report calls that "hace 3 dias" and the filter must agree.
  // A fractional budget still works: --since names a day, and flooring the age
  // keeps that day while dropping the one before it.
  return Math.floor(age) > criteria.maxAgeDays ? 'too-old' : null
}

function rejectByLocation(eligibility: Eligibility, criteria: SearchCriteria): RejectReason | null {
  if (criteria.locationPolicy === 'off') return null
  if (eligibility === 'conflict') return 'location-mismatch'
  if (eligibility === 'unknown' && criteria.locationPolicy === 'strict') return 'location-mismatch'
  return null
}

function reject(
  job: Job,
  criteria: SearchCriteria,
  now: Date,
  eligibility: Eligibility,
): RejectReason | null {
  if (containsAnyTerm(job.title, criteria.excludeTitle)) return 'excluded-title'
  // Gate on title and tags only. See gateText for why the body is excluded.
  if (!containsAnyTerm(gateText(job), criteria.mustHaveAny)) return 'off-target'
  if (containsAnyTerm(job.title, criteria.excludeStack)) return 'excluded-stack'
  if (criteria.remote === 'required' && !job.remote) return 'not-remote'

  const tooOld = rejectByAge(job, criteria, now)
  if (tooOld !== null) return tooOld

  const misplaced = rejectByLocation(eligibility, criteria)
  if (misplaced !== null) return misplaced

  if (job.salaryUsdPerMonth === null) {
    return criteria.salaryUnknownPolicy === 'drop' ? 'salary-unknown' : null
  }
  if (criteria.minSalaryUsd !== null && job.salaryUsdPerMonth < criteria.minSalaryUsd) {
    return 'below-salary-floor'
  }
  return null
}

function collectWarnings(text: string, criteria: SearchCriteria): string[] {
  const warnings: string[] = []

  if (containsAnyTerm(text, criteria.excludeStack)) {
    warnings.push('mentions an excluded stack in the body')
  }
  if (containsAnyTerm(text, ['staffing', 'body shopping', 'outsourcing'])) {
    warnings.push('looks like a staffing agency')
  }
  if (containsAnyTerm(text, ['backend', 'back-end', 'full stack', 'fullstack'])) {
    warnings.push('scope may extend beyond mobile')
  }
  return warnings
}

/** Scores a single job against the criteria. Pure: no I/O, no clock of its own. */
export function evaluate(job: Job, criteria: SearchCriteria, now: Date): Evaluation {
  const text = searchableText(job)
  const eligibility = assessEligibility(job, criteria)
  const rejected = reject(job, criteria, now, eligibility)
  const { fraction: stack, matched } = stackFraction(text, criteria)

  const breakdown: ScoreBreakdown = {
    stack: stack * WEIGHTS.stack,
    seniority: seniorityFraction(text, criteria) * WEIGHTS.seniority,
    salary: salaryFraction(job, criteria) * WEIGHTS.salary,
    recency: recencyFraction(job, now) * WEIGHTS.recency,
    location: locationFraction(eligibility) * WEIGHTS.location,
  }

  const total = Object.values(breakdown).reduce((sum, part) => sum + part, 0)

  return {
    job,
    rejected,
    score: Math.round(clamp(total, 0, 100)),
    breakdown,
    matchedStack: matched,
    warnings: collectWarnings(text, criteria),
  }
}

/** Evaluates, drops rejects, and sorts by score descending. */
export function rankJobs(
  jobs: readonly Job[],
  criteria: SearchCriteria,
  now: Date,
): Evaluation[] {
  return jobs
    .map((job) => evaluate(job, criteria, now))
    .filter((evaluation) => evaluation.rejected === null)
    .sort((a, b) => b.score - a.score)
}

/** Evaluates everything, keeping rejects, for diagnostics. */
export function evaluateAll(
  jobs: readonly Job[],
  criteria: SearchCriteria,
  now: Date,
): Evaluation[] {
  return jobs.map((job) => evaluate(job, criteria, now))
}

/**
 * Collapses offers that are the same opening published on several boards,
 * keeping the highest-scoring copy. Runs after scoring on purpose: "the best
 * copy" only means something once every copy has a score.
 */
export function collapseSameOffers(evaluations: readonly Evaluation[]): Evaluation[] {
  const best = new Map<string, Evaluation>()

  for (const evaluation of evaluations) {
    const key = contentKey(evaluation.job)
    const current = best.get(key)
    if (current === undefined || evaluation.score > current.score) best.set(key, evaluation)
  }
  return [...best.values()].sort((a, b) => b.score - a.score)
}
