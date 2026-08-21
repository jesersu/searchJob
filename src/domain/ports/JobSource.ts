import type { Job } from '../Job.js'
import type { SearchCriteria } from '../SearchCriteria.js'

/** What a source can do natively. Drives how much filtering the domain must redo. */
export interface SourceCapabilities {
  /** The API narrows results by query term. Never trusted as a final filter. */
  readonly serverSideQuery: boolean
  readonly seniorityFilter: boolean
  readonly salaryData: boolean
  /** Requires a persisted authenticated session (see SessionProvider). */
  readonly requiresAuth: boolean
}

/**
 * Driven port. Every board is an adapter behind this, whether it is a clean
 * REST API or a browser session fighting a captcha.
 */
export interface JobSource {
  readonly id: string
  readonly capabilities: SourceCapabilities
  search(criteria: SearchCriteria): Promise<Job[]>
}
