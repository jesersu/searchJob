import type { Job } from './Job.js'
import type { SearchCriteria } from './SearchCriteria.js'
import { containsAnyTerm } from './TermMatcher.js'

/**
 * Whether a posting is plausibly reachable from where the candidate lives.
 *
 * `unknown` is a first-class outcome. Most postings name no place at all, and
 * absence of a restriction is not evidence of one.
 */
export type Eligibility = 'match' | 'unknown' | 'conflict'

const LATAM_COUNTRIES = [
  'peru', 'perú', 'argentina', 'chile', 'colombia', 'mexico', 'méxico', 'brazil', 'brasil',
  'uruguay', 'paraguay', 'bolivia', 'ecuador', 'venezuela', 'costa rica', 'panama', 'panamá',
  'guatemala', 'honduras', 'nicaragua', 'el salvador', 'dominican republic', 'puerto rico',
] as const

const LATAM_REGIONS = [
  'latam', 'latin america', 'latinoamerica', 'latinoamérica', 'south america',
  'central america', 'sudamerica', 'sudamérica',
] as const

const NORTH_AMERICA = ['united states', 'usa', 'canada'] as const

const GLOBAL_TERMS = [
  'worldwide', 'anywhere', 'global', 'remote worldwide', 'fully remote',
  'any country', 'any timezone', 'remote anywhere',
] as const

const ZONE_TERMS: Readonly<Record<string, readonly string[]>> = {
  latam: [...LATAM_REGIONS, ...LATAM_COUNTRIES],
  americas: [...LATAM_REGIONS, ...LATAM_COUNTRIES, ...NORTH_AMERICA, 'americas', 'north america'],
  global: GLOBAL_TERMS,
  worldwide: GLOBAL_TERMS,
}

/**
 * Places that positively scope a posting somewhere else. Australian and Indian
 * cities are listed because live runs surfaced Townsville, Brisbane, Adelaide,
 * Cairns, Mackay, Chennai and Kyiv in the location field with no country.
 */
const OUTSIDE_PLACES = [
  // North America. Excluded from the conflict list whenever the `americas`
  // zone is allowed, so this only bites a latam-only configuration.
  'united states', 'usa', 'canada',
  // Europe
  'portugal', 'poland', 'spain', 'españa', 'france', 'germany', 'deutschland', 'italy',
  'netherlands', 'belgium', 'ireland', 'united kingdom', 'england', 'scotland', 'romania',
  'bulgaria', 'ukraine', 'kyiv', 'kiev', 'lviv', 'serbia', 'greece', 'czechia', 'hungary',
  'austria', 'switzerland', 'sweden', 'norway', 'denmark', 'finland', 'lisbon', 'porto',
  'madrid', 'barcelona', 'berlin', 'munich', 'paris', 'london', 'dublin', 'amsterdam',
  'warsaw', 'krakow', 'bucharest', 'milan', 'rome',
  // Asia and Middle East
  'india', 'chennai', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'pune',
  'pakistan', 'bangladesh', 'vietnam', 'philippines', 'manila', 'indonesia', 'malaysia',
  'singapore', 'thailand', 'china', 'japan', 'tokyo', 'south korea', 'turkey', 'istanbul',
  'israel', 'tel aviv', 'united arab emirates', 'dubai', 'abu dhabi', 'saudi arabia', 'qatar',
  // Africa
  'nigeria', 'lagos', 'kenya', 'nairobi', 'egypt', 'cairo', 'south africa', 'ghana', 'morocco',
  // Oceania
  'australia', 'new zealand', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide',
  'canberra', 'townsville', 'cairns', 'mackay', 'maitland', 'milton', 'auckland', 'wellington',
] as const

/** Terms that make a posting reachable, derived from country plus zones. */
export function allowedTerms(criteria: SearchCriteria): string[] {
  const terms = new Set<string>()

  if (criteria.country !== null && criteria.country.trim().length > 0) {
    terms.add(criteria.country.trim().toLowerCase())
  }
  for (const zone of criteria.zones) {
    for (const term of ZONE_TERMS[zone] ?? [zone]) terms.add(term)
  }
  return [...terms]
}

export function assessEligibility(job: Job, criteria: SearchCriteria): Eligibility {
  const allowed = allowedTerms(criteria)
  if (allowed.length === 0) return 'unknown'

  // Title and location state the posting's scope. The body only describes it.
  const scope = [job.title, job.location ?? ''].join(' \n ')
  if (containsAnyTerm(scope, allowed)) return 'match'

  const excluded = OUTSIDE_PLACES.filter((place) => !allowed.includes(place))
  if (containsAnyTerm(scope, excluded)) return 'conflict'

  // Nothing in the scope decides it: fall back to the body.
  return containsAnyTerm(job.description, allowed) ? 'match' : 'unknown'
}
