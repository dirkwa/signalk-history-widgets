import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZONES,
  PI_DEFAULTS,
  barMetrics,
  metricLevel,
  parsePiConfig,
  throttleWarning,
  zonesFor
} from '../src/pi-model.js'

const kelvin = (celsius: number) => celsius + 273.15

describe('parsePiConfig', () => {
  it('falls back to the defaults for missing or mistyped settings', () => {
    expect(parsePiConfig(undefined)).toEqual(PI_DEFAULTS)
    expect(parsePiConfig({ label: 3, showStorage: 'yes' })).toEqual(PI_DEFAULTS)
    expect(parsePiConfig({ label: 'Salon', showStorage: true, theme: 'light' })).toEqual({
      label: 'Salon',
      showStorage: true,
      theme: 'light'
    })
  })
})

describe('barMetrics', () => {
  it('shows storage only when chosen', () => {
    expect(barMetrics(PI_DEFAULTS)).toEqual(['cpu', 'memory'])
    expect(barMetrics({ ...PI_DEFAULTS, showStorage: true })).toEqual(['cpu', 'memory', 'storage'])
  })
})

describe('levels', () => {
  it('turns the temperature yellow from 70 °C and red from 80 °C', () => {
    const zones = DEFAULT_ZONES.temperature
    expect(metricLevel(kelvin(55), zones)).toBe('ok')
    expect(metricLevel(kelvin(72), zones)).toBe('warn')
    expect(metricLevel(kelvin(80), zones)).toBe('alarm')
    expect(metricLevel(kelvin(85), zones)).toBe('alarm')
  })

  it('turns CPU load and memory yellow and red as they run short', () => {
    expect(metricLevel(0.3, DEFAULT_ZONES.cpu)).toBe('ok')
    expect(metricLevel(0.85, DEFAULT_ZONES.cpu)).toBe('warn')
    expect(metricLevel(0.97, DEFAULT_ZONES.cpu)).toBe('alarm')
    expect(metricLevel(0.85, DEFAULT_ZONES.memory)).toBe('warn')
    expect(metricLevel(0.92, DEFAULT_ZONES.memory)).toBe('alarm')
  })

  it("prefers the zones in the path's metadata", () => {
    const own = zonesFor('temperature', [{ lower: kelvin(60), state: 'alarm' }])
    expect(metricLevel(kelvin(65), own)).toBe('alarm')
    expect(zonesFor('temperature', [])).toEqual(DEFAULT_ZONES.temperature)
    expect(zonesFor('cpu', undefined)).toEqual(DEFAULT_ZONES.cpu)
  })
})

describe('throttleWarning', () => {
  it('names low voltage before throttling, and nothing when all is well', () => {
    expect(throttleWarning({})).toBeUndefined()
    expect(throttleWarning({ throttled: true })).toBe('Throttled')
    expect(throttleWarning({ underVoltage: true, throttled: true })).toBe('Low voltage')
  })
})
