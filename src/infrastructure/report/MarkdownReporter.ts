import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SearchOutcome } from '@app/SearchJobsUseCase'
import { ageFilterLabel, ageLabel, salaryLabel, topStack } from './format.js'

function renderMarkdown(outcome: SearchOutcome, now: Date): string {
  const { criteria, stats } = outcome
  const lines: string[] = []

  lines.push(`# ${criteria.label}`)
  lines.push('')
  lines.push(`_Generado ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC_`)
  lines.push('')
  lines.push(
    `**${stats.raw}** crudo → **${stats.deduped}** tras dedupe → **${stats.ranked}** relevantes · ` +
      `**${stats.newCount}** nuevas · ${(stats.elapsedMs / 1000).toFixed(1)}s`,
  )
  if (criteria.maxAgeDays !== null) {
    lines.push(`Filtro de antigüedad: **${ageFilterLabel(criteria.maxAgeDays, now)}**.`)
    lines.push('')
  }

  lines.push('| Fuente | Ofertas |')
  lines.push('|---|---|')
  for (const [id, count] of Object.entries(stats.perSource)) lines.push(`| ${id} | ${count} |`)
  lines.push('')

  if (stats.failures.length > 0) {
    lines.push('> **Fuentes con error**')
    for (const failure of stats.failures) lines.push(`> - \`${failure.source}\`: ${failure.error}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  for (const [index, evaluation] of outcome.evaluations.entries()) {
    const { job } = evaluation
    const isNew = outcome.newIds.has(job.id) ? ' `NUEVA`' : ''

    lines.push(`### ${index + 1}. ${evaluation.score} · ${job.title} — ${job.company}${isNew}`)
    lines.push('')
    lines.push(`🔗 ${job.url}`)
    lines.push('')
    lines.push(
      `💰 ${salaryLabel(evaluation)} · 🏷️ ${job.source} · 📅 ${ageLabel(job.publishedAt, now)}` +
        (job.location ? ` · 🌎 ${job.location}` : ''),
    )
    lines.push('')
    lines.push(`✅ ${topStack(evaluation)}`)
    for (const warning of evaluation.warnings) lines.push(`\n⚠️ ${warning}`)
    lines.push('')
  }

  if (outcome.evaluations.length === 0) {
    lines.push('_Sin resultados._')
  }

  return lines.join('\n')
}

export async function writeMarkdownReport(
  outcome: SearchOutcome,
  now: Date,
  path: string,
): Promise<string> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, renderMarkdown(outcome, now), 'utf8')
  return path
}
