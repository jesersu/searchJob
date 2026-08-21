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

const NORTH_AMERICA_COUNTRIES = ['united states', 'usa', 'canada'] as const
const AMERICAS_REGIONS = ['americas', 'north america'] as const

const GLOBAL_TERMS = [
  'worldwide', 'anywhere', 'global', 'remote worldwide', 'fully remote',
  'any country', 'any timezone', 'remote anywhere',
] as const

/**
 * A zone has two kinds of term, and the difference matters.
 *
 * A **region** ("latam", "worldwide") covers the candidate's own country by
 * definition, so it stays eligible however strict the configuration is.
 * A **country** ("colombia", "united states") scopes a posting somewhere
 * specific, which may or may not include the candidate.
 */
interface Zone {
  readonly regions: readonly string[]
  readonly countries: readonly string[]
}

const ZONES: Readonly<Record<string, Zone>> = {
  latam: { regions: LATAM_REGIONS, countries: LATAM_COUNTRIES },
  americas: {
    regions: [...LATAM_REGIONS, ...AMERICAS_REGIONS],
    countries: [...LATAM_COUNTRIES, ...NORTH_AMERICA_COUNTRIES],
  },
  global: { regions: GLOBAL_TERMS, countries: [] },
  worldwide: { regions: GLOBAL_TERMS, countries: [] },
}

/** "perú" and "peru" are the same place. Compare without diacritics. */
function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function ownCountry(criteria: SearchCriteria): string | null {
  const raw = criteria.country?.trim().toLowerCase()
  return raw !== undefined && raw.length > 0 ? raw : null
}

/** True when the posting must name the candidate's own country or a region. */
function isCountryRequired(criteria: SearchCriteria): boolean {
  return criteria.requireCountry && ownCountry(criteria) !== null
}

/** Every spelling of the candidate's country present in the zone tables. */
function ownCountryAliases(own: string): string[] {
  const target = deaccent(own)
  const aliases = LATAM_COUNTRIES.filter((name) => deaccent(name) === target)
  return aliases.length > 0 ? [...aliases] : [own]
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
  const own = ownCountry(criteria)
  const strict = isCountryRequired(criteria)

  if (own !== null) for (const alias of ownCountryAliases(own)) terms.add(alias)

  for (const zone of criteria.zones) {
    const definition = ZONES[zone]
    if (definition === undefined) {
      terms.add(zone)
      continue
    }
    for (const region of definition.regions) terms.add(region)
    // Under requireCountry, another country in the zone is not a substitute
    // for the candidate's own.
    if (!strict) for (const country of definition.countries) terms.add(country)
  }
  return [...terms]
}

/** Places that positively scope a posting away from the candidate. */
function excludedPlaces(criteria: SearchCriteria, allowed: readonly string[]): string[] {
  const excluded = new Set<string>(OUTSIDE_PLACES.filter((place) => !allowed.includes(place)))

  if (isCountryRequired(criteria)) {
    const target = deaccent(ownCountry(criteria) ?? '')
    for (const zone of criteria.zones) {
      for (const country of ZONES[zone]?.countries ?? []) {
        if (deaccent(country) !== target) excluded.add(country)
      }
    }
  }
  return [...excluded]
}

export function assessEligibility(job: Job, criteria: SearchCriteria): Eligibility {
  const allowed = allowedTerms(criteria)
  if (allowed.length === 0) return 'unknown'

  // Title and location state the posting's scope. The body only describes it.
  const scope = [job.title, job.location ?? ''].join(' \n ')
  if (containsAnyTerm(scope, allowed)) return 'match'

  if (containsAnyTerm(scope, excludedPlaces(criteria, allowed))) return 'conflict'

  // Nothing in the scope decides it: fall back to the body.
  return containsAnyTerm(job.description, allowed) ? 'match' : 'unknown'
}
