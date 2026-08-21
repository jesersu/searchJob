import type { Job } from '@domain/Job'
import type { SearchCriteria } from '@domain/SearchCriteria'

export const NOW = new Date('2026-08-21T12:00:00Z')

export function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

export function aJob(overrides: Partial<Job> = {}): Job {
  // Real ids are derived from the canonical URL, so distinct URLs must produce
  // distinct ids or identity tests pass for the wrong reason.
  const base: Job = {
    id: 'job-1',
    source: 'test',
    title: 'iOS Engineer',
    company: 'Acme',
    url: 'https://example.com/job-1',
    description: 'Build iOS apps with Swift and SwiftUI.',
    tags: [],
    salaryUsdPerMonth: null,
    salaryRaw: null,
    remote: true,
    location: null,
    publishedAt: daysAgo(2),
    ...overrides,
  }
  return overrides.id === undefined ? { ...base, id: base.url } : base
}

export function mobileCriteria(overrides: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    role: 'mobile',
    label: 'Senior Mobile Developer',
    seniority: ['senior', 'staff', 'lead'],
    queries: { primary: ['ios engineer', 'swift'], secondary: ['react native'] },
    stack: {
      expert: ['swift', 'swiftui', 'uikit', 'combine', 'core data', 'viper', 'mvvm'],
      strong: ['kotlin', 'react native', 'graphql', 'offline-first', 'fastlane'],
      working: ['flutter', 'docker', 'aws'],
    },
    mustHaveAny: ['ios', 'swift', 'mobile', 'android', 'kotlin', 'react native', 'flutter'],
    excludeTitle: ['junior', 'intern', 'trainee', 'practicante'],
    excludeStack: ['php', 'salesforce', 'wordpress'],
    remote: 'required',
    zones: ['latam', 'americas', 'global'],
    country: 'peru',
    locationPolicy: 'balanced',
    requireCountry: false,
    minSalaryUsd: 4000,
    salaryTargetUsd: null,
    salaryUnknownPolicy: 'keep',
    maxAgeDays: null,
    unknownDatePolicy: 'keep',
    ...overrides,
  }
}
