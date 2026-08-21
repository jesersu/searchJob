export type Seniority = 'junior' | 'mid' | 'senior' | 'staff' | 'lead' | 'principal'

/** Stack terms grouped by how strongly the candidate commands them. */
export interface StackTiers {
  readonly expert: readonly string[]
  readonly strong: readonly string[]
  readonly working: readonly string[]
}

export interface QuerySet {
  readonly primary: readonly string[]
  readonly secondary: readonly string[]
}

export type RemotePolicy = 'required' | 'preferred' | 'any'
/** What to do with offers that publish no salary. Most offers publish none. */
export type SalaryUnknownPolicy = 'keep' | 'drop'
/** What to do with offers that publish no date, when an age filter is active. */
export type UnknownDatePolicy = 'keep' | 'drop'
/**
 * How hard to filter by location.
 * `balanced` drops only postings scoped to an unreachable place;
 * `strict` also drops postings that name no place at all;
 * `off` disables the filter and keeps location as a scoring signal only.
 */
export type LocationPolicy = 'balanced' | 'strict' | 'off'

export interface SearchCriteria {
  readonly role: string
  readonly label: string
  readonly seniority: readonly Seniority[]
  readonly queries: QuerySet
  readonly stack: StackTiers
  readonly mustHaveAny: readonly string[]
  readonly excludeTitle: readonly string[]
  readonly excludeStack: readonly string[]
  readonly remote: RemotePolicy
  readonly zones: readonly string[]
  /** Where the candidate lives. Always an allowed location. */
  readonly country: string | null
  readonly locationPolicy: LocationPolicy
  /** Filter threshold: offers paying less are discarded. */
  readonly minSalaryUsd: number | null
  /** Score ceiling: at or above this, salary earns full credit. */
  readonly salaryTargetUsd: number | null
  readonly salaryUnknownPolicy: SalaryUnknownPolicy
  /** Maximum age in days. null disables the filter entirely. */
  readonly maxAgeDays: number | null
  readonly unknownDatePolicy: UnknownDatePolicy
}

/** All query terms, primary first. */
export function allQueries(criteria: SearchCriteria): string[] {
  return [...criteria.queries.primary, ...criteria.queries.secondary]
}
