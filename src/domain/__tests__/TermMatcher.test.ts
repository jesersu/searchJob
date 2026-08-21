import { describe, expect, it } from 'vitest'
import { containsTerm, containsAnyTerm } from '@domain/TermMatcher'

describe('containsTerm', () => {
  // Bug encontrado en produccion: buscar "ios" como substring matchea
  // palabras españolas terminadas en -ios y contamina la busqueda.
  it('does not match Spanish words ending in -ios', () => {
    expect(containsTerm('Auxiliar de Almacen e Inventarios', 'ios')).toBe(false)
    expect(containsTerm('Ejecutivo Negocios Empresas PYME', 'ios')).toBe(false)
    expect(containsTerm('Servicios Tecnico de Computadores', 'ios')).toBe(false)
    expect(containsTerm('Asesor Comercial de Servicios', 'ios')).toBe(false)
    expect(containsTerm('Analista de Comentarios', 'ios')).toBe(false)
  })

  it('matches iOS as a standalone token regardless of case', () => {
    expect(containsTerm('iOS Developer (Swift)', 'ios')).toBe(true)
    expect(containsTerm('Senior IOS engineer', 'ios')).toBe(true)
    expect(containsTerm('Desarrollador iOS/Swift', 'ios')).toBe(true)
    expect(containsTerm('Mobile Engineer - iOS/Swift', 'ios')).toBe(true)
    expect(containsTerm('Staff Software Engineer - iOS', 'ios')).toBe(true)
  })

  it('matches multi-word terms', () => {
    expect(containsTerm('Senior React Native Developer', 'react native')).toBe(true)
    expect(containsTerm('Frontend Developer (React Native / TS)', 'react native')).toBe(true)
  })

  it('treats hyphen and slash as separators', () => {
    expect(containsTerm('Swift/Objective-C Developer', 'objective-c')).toBe(true)
    expect(containsTerm('react-native specialist', 'react native')).toBe(true)
  })

  it('does not match a term embedded in a longer word', () => {
    expect(containsTerm('Swiftly Analytics Engineer', 'swift')).toBe(false)
    expect(containsTerm('Androidology researcher', 'android')).toBe(false)
  })

  it('escapes regex metacharacters in the term', () => {
    expect(containsTerm('Experience with C++ and Swift', 'c++')).toBe(true)
    expect(containsTerm('Uses .NET framework', '.net')).toBe(true)
  })
})

describe('containsAnyTerm', () => {
  it('returns true when at least one term matches', () => {
    expect(containsAnyTerm('Kotlin Engineer', ['ios', 'kotlin'])).toBe(true)
  })
  it('returns false when no term matches', () => {
    expect(containsAnyTerm('Inventarios y Negocios', ['ios', 'swift'])).toBe(false)
  })
  it('returns false for an empty term list', () => {
    expect(containsAnyTerm('iOS Developer', [])).toBe(false)
  })
})
