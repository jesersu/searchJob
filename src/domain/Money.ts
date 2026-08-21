/**
 * Salary normalization to USD per month.
 *
 * Sources publish salaries in mixed currencies and periodicities. Comparing raw
 * amounts ranks 5,900,000 COP/month (~USD 1,475) above USD 120,000/year
 * (USD 10,000/month). Everything is normalized before it reaches the scorer.
 */

export const HOURS_PER_MONTH = 160
export const WEEKS_PER_MONTH = 4.33
export const DAYS_PER_MONTH = 21

/** Below this, the figure is noise (a typo, a stipend, a per-task fee). */
export const SANITY_MIN_USD_MONTH = 300
/** Above this, the source mislabeled the periodicity or the currency. */
export const SANITY_MAX_USD_MONTH = 60_000

export type Periodicity = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'

/** Approximate units of each currency per 1 USD. Refresh periodically. */
const UNITS_PER_USD: Readonly<Record<string, number>> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.51,
  COP: 4_000,
  PEN: 3.7,
  MXN: 18,
  ARS: 1_000,
  CLP: 950,
  BRL: 5.4,
  UYU: 39,
  CRC: 510,
  PLN: 4,
  INR: 83,
  CHF: 0.88,
  SEK: 10.5,
  NOK: 10.8,
  DKK: 6.9,
  ZAR: 18.5,
}

const PERIOD_MULTIPLIER: Readonly<Record<Periodicity, number>> = {
  hourly: HOURS_PER_MONTH,
  daily: DAYS_PER_MONTH,
  weekly: WEEKS_PER_MONTH,
  monthly: 1,
  yearly: 1 / 12,
}

function isPeriodicity(value: string): value is Periodicity {
  return value in PERIOD_MULTIPLIER
}

/**
 * Converts an amount to USD per month.
 * Returns null when the value is missing, unconvertible, or implausible —
 * "unknown" is a valid outcome and must never be faked as zero.
 */
export function toUsdPerMonth(
  amount: number | null | undefined,
  currency: string,
  periodicity: string,
): number | null {
  if (amount === null || amount === undefined) return null
  if (!Number.isFinite(amount) || amount <= 0) return null

  const rate = UNITS_PER_USD[currency.toUpperCase()]
  if (rate === undefined) return null

  const normalizedPeriod = periodicity.toLowerCase()
  if (!isPeriodicity(normalizedPeriod)) return null

  const usdPerMonth = Math.round((amount / rate) * PERIOD_MULTIPLIER[normalizedPeriod])

  if (usdPerMonth < SANITY_MIN_USD_MONTH) return null
  if (usdPerMonth > SANITY_MAX_USD_MONTH) return null

  return usdPerMonth
}

/** True when the currency can be converted at all. */
export function isSupportedCurrency(currency: string): boolean {
  return currency.toUpperCase() in UNITS_PER_USD
}
