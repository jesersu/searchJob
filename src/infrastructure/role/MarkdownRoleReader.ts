import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import type { RoleReader } from '@domain/ports/RoleReader'
import type {
  LocationPolicy,
  RemotePolicy,
  SalaryUnknownPolicy,
  SearchCriteria,
  Seniority,
  StackTiers,
  UnknownDatePolicy,
} from '@domain/SearchCriteria'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

const VALID_SENIORITY: readonly string[] = ['junior', 'mid', 'senior', 'staff', 'lead', 'principal']
const VALID_REMOTE: readonly string[] = ['required', 'preferred', 'any']
const VALID_LOCATION_POLICY: readonly string[] = ['balanced', 'strict', 'off']

export class RoleFileError extends Error {}

function lowerList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new RoleFileError(`"${field}" must be a list`)
  return value.map((item) => String(item).trim().toLowerCase()).filter((item) => item.length > 0)
}

function readStack(value: unknown): StackTiers {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    expert: lowerList(raw['expert'], 'stack.expert'),
    strong: lowerList(raw['strong'], 'stack.strong'),
    working: lowerList(raw['working'], 'stack.working'),
  }
}

function readQueries(value: unknown): { primary: string[]; secondary: string[] } {
  // A bare list is accepted and treated as primary.
  if (Array.isArray(value)) return { primary: lowerList(value, 'queries'), secondary: [] }

  const raw = (value ?? {}) as Record<string, unknown>
  return {
    primary: lowerList(raw['primary'], 'queries.primary'),
    secondary: lowerList(raw['secondary'], 'queries.secondary'),
  }
}

function readSeniority(value: unknown): Seniority[] {
  const levels = lowerList(value, 'seniority')
  const invalid = levels.filter((level) => !VALID_SENIORITY.includes(level))
  if (invalid.length > 0) {
    throw new RoleFileError(`unknown seniority: ${invalid.join(', ')}`)
  }
  return levels as Seniority[]
}

function readKeepDrop(value: unknown, field: string, fallback: 'keep' | 'drop'): 'keep' | 'drop' {
  const policy = String(value ?? fallback).toLowerCase()
  if (policy !== 'keep' && policy !== 'drop') {
    throw new RoleFileError(`"${field}" must be keep or drop`)
  }
  return policy
}

function readPositiveNumber(value: unknown, field: string): number | null {
  const parsed = readNumber(value, field)
  if (parsed !== null && parsed <= 0) throw new RoleFileError(`"${field}" must be greater than 0`)
  return parsed
}

function readNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new RoleFileError(`"${field}" must be a number`)
  return parsed
}

/** Parses the YAML frontmatter into criteria. The body is kept as context. */
export function parseRoleFile(content: string): { criteria: SearchCriteria; context: string } {
  const match = FRONTMATTER.exec(content)
  if (!match) throw new RoleFileError('role file must start with YAML frontmatter between --- markers')

  const front = parseYaml(match[1] ?? '') as Record<string, unknown> | null
  if (!front || typeof front !== 'object') throw new RoleFileError('frontmatter is empty')

  const role = String(front['role'] ?? '').trim()
  if (role.length === 0) throw new RoleFileError('"role" is required')

  const queries = readQueries(front['queries'])
  if (queries.primary.length === 0) throw new RoleFileError('"queries.primary" must not be empty')

  const remote = String(front['remote'] ?? 'any').toLowerCase()
  if (!VALID_REMOTE.includes(remote)) {
    throw new RoleFileError(`"remote" must be one of ${VALID_REMOTE.join(', ')}`)
  }

  const locationPolicy = String(front['location_policy'] ?? 'balanced').toLowerCase()
  if (!VALID_LOCATION_POLICY.includes(locationPolicy)) {
    throw new RoleFileError(`"location_policy" must be one of ${VALID_LOCATION_POLICY.join(', ')}`)
  }

  const country = front['country'] === undefined ? null : String(front['country']).trim().toLowerCase()

  const salaryPolicy = readKeepDrop(front['salary_unknown_policy'], 'salary_unknown_policy', 'keep')
  const datePolicy = readKeepDrop(front['unknown_date_policy'], 'unknown_date_policy', 'keep')

  const minSalaryUsd = readNumber(front['min_salary_usd'], 'min_salary_usd')
  const salaryTargetUsd = readNumber(front['salary_target_usd'], 'salary_target_usd')
  if (minSalaryUsd !== null && salaryTargetUsd !== null && salaryTargetUsd <= minSalaryUsd) {
    throw new RoleFileError('"salary_target_usd" must be greater than "min_salary_usd"')
  }

  const criteria: SearchCriteria = {
    role,
    label: String(front['label'] ?? role),
    seniority: readSeniority(front['seniority']),
    queries,
    stack: readStack(front['stack']),
    mustHaveAny: lowerList(front['must_have_any'], 'must_have_any'),
    excludeTitle: lowerList(front['exclude_title'], 'exclude_title'),
    excludeStack: lowerList(front['exclude_stack'], 'exclude_stack'),
    remote: remote as RemotePolicy,
    zones: lowerList(front['zones'], 'zones'),
    country: country !== null && country.length > 0 ? country : null,
    locationPolicy: locationPolicy as LocationPolicy,
    requireCountry: front['require_country'] === true,
    minSalaryUsd,
    salaryTargetUsd,
    salaryUnknownPolicy: salaryPolicy as SalaryUnknownPolicy,
    maxAgeDays: readPositiveNumber(front['max_age_days'], 'max_age_days'),
    unknownDatePolicy: datePolicy as UnknownDatePolicy,
  }

  return { criteria, context: (match[2] ?? '').trim() }
}

export class MarkdownRoleReader implements RoleReader {
  async read(path: string): Promise<{ criteria: SearchCriteria; context: string }> {
    const content = await readFile(path, 'utf8')
    try {
      return parseRoleFile(content)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new RoleFileError(`${path}: ${reason}`)
    }
  }
}
