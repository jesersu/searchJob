import { createHash } from 'node:crypto'
import type { Job } from '@domain/Job'

/** Canonical URL: lowercased host, no query string, no trailing slash. */
export function canonicalUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    url.search = ''
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    return url.toString().replace(/\/$/, '')
  } catch {
    return rawUrl.trim()
  }
}

/** Stable id derived from the canonical URL, so reruns dedupe correctly. */
export function jobId(rawUrl: string): string {
  return createHash('sha1').update(canonicalUrl(rawUrl)).digest('hex').slice(0, 16)
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function toDate(value: unknown): Date | null {
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function buildJob(partial: Omit<Job, 'id'> & { url: string }): Job {
  return { ...partial, id: jobId(partial.url), url: canonicalUrl(partial.url) }
}
