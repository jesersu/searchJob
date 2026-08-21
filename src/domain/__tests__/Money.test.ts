import { describe, expect, it } from 'vitest'
import { toUsdPerMonth, SANITY_MIN_USD_MONTH, SANITY_MAX_USD_MONTH } from '@domain/Money'

describe('toUsdPerMonth', () => {
  // Bug encontrado en produccion: Torre mezcla COP y USD, yearly y monthly.
  // Ordenar sin normalizar puso 5.900.000 COP por encima de 120.000 USD/year.
  it('normalizes COP monthly below USD yearly', () => {
    const cop = toUsdPerMonth(5_900_000, 'COP', 'monthly')
    const usd = toUsdPerMonth(120_000, 'USD', 'yearly')
    expect(cop).not.toBeNull()
    expect(usd).not.toBeNull()
    expect(cop!).toBeLessThan(usd!)
  })

  it('converts yearly USD to monthly', () => {
    expect(toUsdPerMonth(120_000, 'USD', 'yearly')).toBe(10_000)
  })

  it('converts hourly USD using a 160h month', () => {
    expect(toUsdPerMonth(50, 'USD', 'hourly')).toBe(8_000)
  })

  it('passes monthly USD through unchanged', () => {
    expect(toUsdPerMonth(6_500, 'USD', 'monthly')).toBe(6_500)
  })

  // Bug encontrado en produccion: Torre devolvio "USD 100.000/mes" (1.2M/year).
  it('rejects implausible outliers as unknown', () => {
    expect(toUsdPerMonth(1_200_000, 'USD', 'yearly')).toBeNull()
    expect(toUsdPerMonth(SANITY_MAX_USD_MONTH + 1, 'USD', 'monthly')).toBeNull()
  })

  it('rejects amounts below the sanity floor as unknown', () => {
    expect(toUsdPerMonth(SANITY_MIN_USD_MONTH - 1, 'USD', 'monthly')).toBeNull()
    expect(toUsdPerMonth(0, 'USD', 'monthly')).toBeNull()
  })

  it('returns null for unknown currencies instead of guessing', () => {
    expect(toUsdPerMonth(5_000, 'XYZ', 'monthly')).toBeNull()
  })

  it('returns null for null or negative amounts', () => {
    expect(toUsdPerMonth(null, 'USD', 'monthly')).toBeNull()
    expect(toUsdPerMonth(-100, 'USD', 'monthly')).toBeNull()
  })
})
