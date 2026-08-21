import type { Evaluation } from '@domain/Scorer'

export function salaryLabel(evaluation: Evaluation): string {
  const { salaryUsdPerMonth, salaryRaw } = evaluation.job
  if (salaryUsdPerMonth === null) return salaryRaw ?? 'sin publicar'
  return `USD ${salaryUsdPerMonth.toLocaleString('en-US')}/mes`
}

export function ageLabel(publishedAt: Date | null, now: Date): string {
  if (publishedAt === null) return 'fecha desconocida'
  const days = Math.floor((now.getTime() - publishedAt.getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
}

export function topStack(evaluation: Evaluation, limit = 8): string {
  const terms = evaluation.matchedStack.slice(0, limit)
  return terms.length > 0 ? terms.join(', ') : 'sin match de stack'
}

/**
 * Describes the active age filter by cutoff date rather than by a fractional
 * day count: "--since 2026-08-19" is 2.69 days, which reads as noise.
 */
export function ageFilterLabel(maxAgeDays: number, now: Date): string {
  const cutoff = new Date(now.getTime() - maxAgeDays * 86_400_000)
  const days = Math.round(maxAgeDays)
  const unit = days === 1 ? 'día' : 'días'
  return `desde ${cutoff.toISOString().slice(0, 10)} (~${days} ${unit})`
}
