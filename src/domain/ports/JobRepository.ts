import type { Job } from '../Job.js'

/** Persistence port. Without history every run shows the same offers forever. */
export interface JobRepository {
  /** Returns the ids already stored, out of the ones given. */
  findKnownIds(ids: readonly string[]): Promise<Set<string>>
  /** Stores jobs not seen before. Returns how many were new. */
  saveNew(jobs: readonly Job[], role: string): Promise<number>
  close(): Promise<void>
}
