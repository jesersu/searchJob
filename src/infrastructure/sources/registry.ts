import type { JobSource } from '@domain/ports/JobSource'
import { ArbeitnowSource } from './ArbeitnowSource.js'
import { GetOnBoardSource } from './GetOnBoardSource.js'
import { LinkedInGuestSource } from './LinkedInGuestSource.js'
import { RemoteOkSource } from './RemoteOkSource.js'
import { TorreSource } from './TorreSource.js'
import { WeWorkRemotelySource } from './WeWorkRemotelySource.js'

/**
 * Adding a board means adding one line here. Nothing in the domain changes.
 *
 * Remotive is deliberately absent: it answers 200 but returned zero mobile
 * roles that survived domain filtering, so it only costs latency.
 */
export function defaultSources(): JobSource[] {
  return [
    new GetOnBoardSource(),
    new TorreSource(),
    new RemoteOkSource(),
    new LinkedInGuestSource(),
    new WeWorkRemotelySource(),
    new ArbeitnowSource(),
  ]
}

export function sourcesByIds(ids: readonly string[]): JobSource[] {
  if (ids.length === 0) return defaultSources()
  const wanted = new Set(ids)
  return defaultSources().filter((source) => wanted.has(source.id))
}
