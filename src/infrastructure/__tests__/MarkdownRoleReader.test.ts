import { describe, expect, it } from 'vitest'
import { parseRoleFile, RoleFileError } from '@infra/role/MarkdownRoleReader'

const VALID = `---
role: mobile
label: "Senior Mobile"
seniority: [senior, staff]
queries:
  primary: [ios engineer, Swift]
  secondary: [react native]
stack:
  expert: [Swift, SwiftUI]
  strong: [Kotlin]
must_have_any: [iOS, swift]
exclude_title: [Junior]
remote: required
zones: [latam]
country: Peru
location_policy: balanced
min_salary_usd: 4000
salary_unknown_policy: keep
---

## Contexto
Busco producto, no consultora.
`

describe('parseRoleFile', () => {
  it('parses frontmatter into criteria', () => {
    const { criteria } = parseRoleFile(VALID)
    expect(criteria.role).toBe('mobile')
    expect(criteria.seniority).toEqual(['senior', 'staff'])
    expect(criteria.minSalaryUsd).toBe(4000)
    expect(criteria.remote).toBe('required')
  })

  it('lowercases every term so matching is case-insensitive by construction', () => {
    const { criteria } = parseRoleFile(VALID)
    expect(criteria.stack.expert).toEqual(['swift', 'swiftui'])
    expect(criteria.mustHaveAny).toEqual(['ios', 'swift'])
    expect(criteria.queries.primary).toEqual(['ios engineer', 'swift'])
  })

  it('keeps the markdown body as context', () => {
    const { context } = parseRoleFile(VALID)
    expect(context).toContain('Busco producto, no consultora.')
  })

  it('accepts a bare query list as primary', () => {
    const { criteria } = parseRoleFile('---\nrole: x\nqueries: [ios]\n---\n')
    expect(criteria.queries.primary).toEqual(['ios'])
    expect(criteria.queries.secondary).toEqual([])
  })

  it('rejects a file without frontmatter', () => {
    expect(() => parseRoleFile('# just markdown')).toThrow(RoleFileError)
  })

  it('rejects a missing role', () => {
    expect(() => parseRoleFile('---\nqueries: [ios]\n---\n')).toThrow(/role.*required/)
  })

  it('rejects empty primary queries', () => {
    expect(() => parseRoleFile('---\nrole: x\n---\n')).toThrow(/queries\.primary/)
  })

  it('rejects an unknown seniority instead of silently ignoring it', () => {
    expect(() => parseRoleFile('---\nrole: x\nqueries: [ios]\nseniority: [wizard]\n---\n')).toThrow(
      /unknown seniority: wizard/,
    )
  })

  it('rejects an invalid remote policy', () => {
    expect(() => parseRoleFile('---\nrole: x\nqueries: [ios]\nremote: maybe\n---\n')).toThrow(
      /remote/,
    )
  })

  it('parses max_age_days', () => {
    const { criteria } = parseRoleFile('---\nrole: x\nqueries: [ios]\nmax_age_days: 2\n---\n')
    expect(criteria.maxAgeDays).toBe(2)
  })

  it('defaults max_age_days to null so no age filter applies', () => {
    const { criteria } = parseRoleFile('---\nrole: x\nqueries: [ios]\n---\n')
    expect(criteria.maxAgeDays).toBeNull()
    expect(criteria.unknownDatePolicy).toBe('keep')
  })

  it('rejects a non-positive max_age_days', () => {
    expect(() => parseRoleFile('---\nrole: x\nqueries: [ios]\nmax_age_days: 0\n---\n')).toThrow(
      /greater than 0/,
    )
  })

  it('rejects an invalid unknown_date_policy', () => {
    expect(() =>
      parseRoleFile('---\nrole: x\nqueries: [ios]\nunknown_date_policy: sometimes\n---\n'),
    ).toThrow(/unknown_date_policy/)
  })

  it('parses country lowercased', () => {
    const { criteria } = parseRoleFile(VALID)
    expect(criteria.country).toBe('peru')
    expect(criteria.locationPolicy).toBe('balanced')
  })

  it('defaults country to null and the policy to balanced', () => {
    const { criteria } = parseRoleFile('---\nrole: x\nqueries: [ios]\n---\n')
    expect(criteria.country).toBeNull()
    expect(criteria.locationPolicy).toBe('balanced')
  })

  it('rejects an invalid location_policy', () => {
    expect(() =>
      parseRoleFile('---\nrole: x\nqueries: [ios]\nlocation_policy: aggressive\n---\n'),
    ).toThrow(/location_policy/)
  })
})
