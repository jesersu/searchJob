import type { Job } from '@domain/Job'
import type { JobRepository } from '@domain/ports/JobRepository'
import type { JobSource } from '@domain/ports/JobSource'
import { rankJobs, type Evaluation } from '@domain/Scorer'
import type { SearchCriteria } from '@domain/SearchCriteria'

export interface SourceFailure {
  readonly source: string
  readonly error: string
}

export interface SearchStats {
  readonly raw: number
  readonly deduped: number
  readonly ranked: number
  readonly newCount: number
  readonly perSource: Readonly<Record<string, number>>
  readonly failures: readonly SourceFailure[]
  readonly elapsedMs: number
}

export interface SearchOutcome {
  readonly criteria: SearchCriteria
  readonly evaluations: readonly Evaluation[]
  readonly newIds: ReadonlySet<string>
  readonly stats: SearchStats
}

export interface SearchOptions {
  /** Keep only offers never seen in a previous run. */
  readonly onlyNew?: boolean
  readonly now?: Date
}

function dedupeById(jobs: readonly Job[]): Job[] {
  const byId = new Map<string, Job>()
  for (const job of jobs) {
    // First writer wins: sources are queried in registry order of trust.
    if (!byId.has(job.id)) byId.set(job.id, job)
  }
  return [...byId.values()]
}

export class SearchJobsUseCase {
  constructor(
    private readonly sources: readonly JobSource[],
    private readonly repository: JobRepository,
  ) {}

  async execute(criteria: SearchCriteria, options: SearchOptions = {}): Promise<SearchOutcome> {
    const startedAt = Date.now()
    const now = options.now ?? new Date()

    // One slow or broken source must never sink the whole run.
    const settled = await Promise.allSettled(
      this.sources.map(async (source) => ({ source: source.id, jobs: await source.search(criteria) })),
    )

    const collected: Job[] = []
    const perSource: Record<string, number> = {}
    const failures: SourceFailure[] = []

    settled.forEach((result, index) => {
      const sourceId = this.sources[index]?.id ?? 'unknown'
      if (result.status === 'fulfilled') {
        perSource[sourceId] = result.value.jobs.length
        collected.push(...result.value.jobs)
      } else {
        perSource[sourceId] = 0
        failures.push({
          source: sourceId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        })
      }
    })

    const deduped = dedupeById(collected)
    const ranked = rankJobs(deduped, criteria, now)

    const knownIds = await this.repository.findKnownIds(ranked.map((entry) => entry.job.id))
    const newIds = new Set(ranked.map((e) => e.job.id).filter((id) => !knownIds.has(id)))

    await this.repository.saveNew(
      ranked.map((entry) => entry.job),
      criteria.role,
    )

    const visible = options.onlyNew ? ranked.filter((e) => newIds.has(e.job.id)) : ranked

    return {
      criteria,
      evaluations: visible,
      newIds,
      stats: {
        raw: collected.length,
        deduped: deduped.length,
        ranked: ranked.length,
        newCount: newIds.size,
        perSource,
        failures,
        elapsedMs: Date.now() - startedAt,
      },
    }
  }
}
