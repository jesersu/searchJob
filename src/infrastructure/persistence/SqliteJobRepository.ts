import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Job } from '@domain/Job'
import type { JobRepository } from '@domain/ports/JobRepository'

/**
 * History is what makes this tool survive past week one. Without it every run
 * shows the same offers and you stop reading them.
 */
export class SqliteJobRepository implements JobRepository {
  private readonly db: DatabaseSync

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS seen_jobs (
        id           TEXT PRIMARY KEY,
        role         TEXT NOT NULL,
        source       TEXT NOT NULL,
        title        TEXT NOT NULL,
        company      TEXT NOT NULL,
        url          TEXT NOT NULL,
        first_seen   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_seen_jobs_role ON seen_jobs(role);
    `)
  }

  async findKnownIds(ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()

    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT id FROM seen_jobs WHERE id IN (${placeholders})`)
      .all(...ids) as { id: string }[]

    return new Set(rows.map((row) => row.id))
  }

  async saveNew(jobs: readonly Job[], role: string): Promise<number> {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO seen_jobs (id, role, source, title, company, url, first_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const now = new Date().toISOString()
    let inserted = 0

    for (const job of jobs) {
      const result = insert.run(job.id, role, job.source, job.title, job.company, job.url, now)
      if (result.changes > 0) inserted += 1
    }
    return inserted
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
