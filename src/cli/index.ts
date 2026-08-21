import { parseArgs } from 'node:util'
import { basename } from 'node:path'
import type { SearchCriteria } from '@domain/SearchCriteria'
import { SearchJobsUseCase } from '@app/SearchJobsUseCase'
import { SqliteJobRepository } from '@infra/persistence/SqliteJobRepository'
import { renderConsole } from '@infra/report/ConsoleReporter'
import { writeMarkdownReport } from '@infra/report/MarkdownReporter'
import { MarkdownRoleReader, RoleFileError } from '@infra/role/MarkdownRoleReader'
import { sourcesByIds } from '@infra/sources/registry'

const DB_PATH = 'data/jobs.db'
const USAGE = `
Uso: pnpm search <archivo-de-rol> [opciones]

  pnpm search roles/mobile.md
  pnpm search roles/mobile.md --new
  pnpm search roles/mobile.md --limit 30 --sources getonboard,torre

Opciones:
  --new              Muestra solo ofertas nunca vistas en corridas anteriores
  --max-age <n>      Solo ofertas publicadas hace n dias o menos
  --since <fecha>    Solo ofertas publicadas desde esa fecha (YYYY-MM-DD)
  --limit <n>        Cuantas mostrar en consola (default 20)
  --sources <a,b>    Limita las fuentes consultadas
  --no-report        No escribe el archivo markdown

--max-age y --since pisan max_age_days del archivo de rol.
`

const MS_PER_DAY = 86_400_000

/**
 * --since is expressed as days back from now so the domain keeps a single
 * concept of age. Day granularity is what job boards publish anyway.
 */
function applyAgeOverride(
  criteria: SearchCriteria,
  maxAge: string | undefined,
  since: string | undefined,
  now: Date,
): SearchCriteria {
  if (maxAge !== undefined && since !== undefined) {
    throw new Error('Usa --max-age o --since, no los dos.')
  }

  if (maxAge !== undefined) {
    const days = Number(maxAge)
    if (!Number.isFinite(days) || days <= 0) throw new Error('--max-age debe ser un numero mayor a 0')
    return { ...criteria, maxAgeDays: days }
  }

  if (since !== undefined) {
    const from = new Date(`${since}T00:00:00Z`)
    if (Number.isNaN(from.getTime())) throw new Error('--since debe tener formato YYYY-MM-DD')
    if (from.getTime() > now.getTime()) throw new Error('--since no puede ser una fecha futura')
    return { ...criteria, maxAgeDays: (now.getTime() - from.getTime()) / MS_PER_DAY }
  }

  return criteria
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      new: { type: 'boolean', default: false },
      'max-age': { type: 'string' },
      since: { type: 'string' },
      limit: { type: 'string', default: '20' },
      sources: { type: 'string', default: '' },
      'no-report': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })

  const rolePath = positionals[0]
  if (values.help || !rolePath) {
    process.stdout.write(USAGE)
    return rolePath ? 0 : 1
  }

  const limit = Number.parseInt(values.limit ?? '20', 10)
  if (!Number.isFinite(limit) || limit <= 0) {
    process.stderr.write('--limit debe ser un entero positivo\n')
    return 1
  }

  const now = new Date()
  const { criteria: fileCriteria } = await new MarkdownRoleReader().read(rolePath)

  let criteria: SearchCriteria
  try {
    criteria = applyAgeOverride(fileCriteria, values['max-age'], values.since, now)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }

  const sourceIds = (values.sources ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  const sources = sourcesByIds(sourceIds)
  if (sources.length === 0) {
    process.stderr.write(`Ninguna fuente coincide con: ${sourceIds.join(', ')}\n`)
    return 1
  }

  const repository = new SqliteJobRepository(DB_PATH)
  try {
    const outcome = await new SearchJobsUseCase(sources, repository).execute(criteria, {
      onlyNew: values.new === true,
      now,
    })

    process.stdout.write(renderConsole(outcome, now, limit))

    if (values['no-report'] !== true) {
      const stamp = now.toISOString().slice(0, 10)
      const name = basename(rolePath).replace(/\.md$/, '')
      const path = await writeMarkdownReport(outcome, now, `reports/${name}-${stamp}.md`)
      process.stdout.write(`Reporte completo: ${path}\n\n`)
    }
    return 0
  } finally {
    await repository.close()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof RoleFileError) {
      process.stderr.write(`\nArchivo de rol invalido:\n  ${error.message}\n\n`)
    } else {
      process.stderr.write(`\nError: ${error instanceof Error ? error.stack : String(error)}\n\n`)
    }
    process.exit(1)
  })
