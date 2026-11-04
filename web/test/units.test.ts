import { describe, expect, it } from 'vitest'
import { convert, decimalsOf, resolveDisplay } from '../src/units.js'

describe('resolveDisplay', () => {
  it('follows the server preference for the path', () => {
    const d = resolveDisplay(
      { units: 'm/s', displayUnits: { targetUnit: 'km/h', displayFormat: '0.00' } },
      undefined,
      -1
    )
    expect(d.symbol).toBe('km/h')
    expect(d.decimals).toBe(2)
    expect(convert(10, d.conversion)).toBeCloseTo(36)
  })

  it('lets the widget override the unit', () => {
    const d = resolveDisplay({ units: 'm/s', displayUnits: { targetUnit: 'km/h' } }, 'kn', -1)
    expect(d.symbol).toBe('kn')
    expect(d.decimals).toBe(1)
  })

  it('ignores an override the base unit does not allow', () => {
    const d = resolveDisplay({ units: 'K' }, 'kn', 1)
    expect(d.symbol).toBe('°C')
    expect(convert(293.15, d.conversion)).toBeCloseTo(20)
  })

  it('shows angles in whole degrees by default', () => {
    const d = resolveDisplay(
      { units: 'rad', displayUnits: { targetUnit: 'degree', displayFormat: '0.0' } },
      undefined,
      -1
    )
    expect(d).toMatchObject({ angular: true, symbol: '°', decimals: 0 })
    expect(convert(Math.PI, d.conversion)).toBeCloseTo(180)
  })

  it('converts Fahrenheit with its offset', () => {
    const d = resolveDisplay({ units: 'K' }, 'F', 1)
    expect(convert(273.15, d.conversion)).toBeCloseTo(32)
  })

  it('shows a value without known units as it comes', () => {
    const d = resolveDisplay(undefined, undefined, 2)
    expect(d.conversion).toBeUndefined()
    expect(d.symbol).toBe('')
    expect(convert(1.5, d.conversion)).toBe(1.5)
  })
})

describe('decimalsOf', () => {
  it('counts the decimals of a display format', () => {
    expect(decimalsOf('0.0')).toBe(1)
    expect(decimalsOf('0')).toBe(0)
    expect(decimalsOf(undefined)).toBeUndefined()
  })
})
