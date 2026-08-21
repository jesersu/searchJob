import type { SearchOutcome } from '@app/SearchJobsUseCase'
import { ageFilterLabel, ageLabel, salaryLabel, topStack } from './format.js'

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'

export function renderConsole(outcome: SearchOutcome, now: Date, limit: number): string {
  const { stats, criteria } = outcome
  const lines: string[] = []

  lines.push('')
  lines.push(`${BOLD}${criteria.label}${RESET} ${DIM}(${criteria.role})${RESET}`)
  lines.push(
    `${DIM}${stats.raw} crudo → ${stats.deduped} tras dedupe → ${stats.ranked} relevantes · ` +
      `${stats.newCount} nuevas · ${(stats.elapsedMs / 1000).toFixed(1)}s${RESET}`,
  )

  if (criteria.maxAgeDays !== null) {
    lines.push(`${DIM}filtro: publicadas ${ageFilterLabel(criteria.maxAgeDays, now)}${RESET}`)
  }

  if (stats.duplicates > 0) {
    lines.push(
      `${DIM}${stats.duplicates} copia(s) de la misma oferta en otro portal, unificadas${RESET}`,
    )
  }

  const bySource = Object.entries(stats.perSource)
    .map(([id, count]) => `${id}:${count}`)
    .join('  ')
  lines.push(`${DIM}${bySource}${RESET}`)

  for (const failure of stats.failures) {
    lines.push(`${YELLOW}⚠ ${failure.source} falló: ${failure.error}${RESET}`)
  }
  lines.push('')

  outcome.evaluations.slice(0, limit).forEach((evaluation, index) => {
    const { job } = evaluation
    const isNew = outcome.newIds.has(job.id)
    const badge = isNew ? `${GREEN}NUEVA${RESET}` : `${DIM}vista${RESET}`

    lines.push(
      `${BOLD}${String(index + 1).padStart(2)}. [${evaluation.score}]${RESET} ${job.title} ${DIM}—${RESET} ${job.company}  ${badge}`,
    )
    lines.push(`    ${DIM}${job.url}${RESET}`)
    lines.push(
      `    ${salaryLabel(evaluation)} · ${job.source} · ${ageLabel(job.publishedAt, now)}`,
    )
    lines.push(`    ${DIM}${topStack(evaluation)}${RESET}`)
    for (const warning of evaluation.warnings) lines.push(`    ${YELLOW}⚠ ${warning}${RESET}`)
    lines.push('')
  })

  if (outcome.evaluations.length === 0) {
    lines.push(`${YELLOW}Sin resultados. Revisá queries y must_have_any en el archivo de rol.${RESET}`)
    lines.push('')
  }

  return lines.join('\n')
}
