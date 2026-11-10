import { describe, expect, it } from 'vitest'
import {
  GAUGE_MAX,
  POLAR_DEFAULTS,
  RatioAverage,
  parsePolarConfig,
  ratioLevel,
  zonesFor
} from '../src/polar-model.js'
import { gaugeAngle } from '../src/polar-render.js'

describe('parsePolarConfig', () => {
  it('falls back to the defaults for missing or unknown settings', () => {
    expect(parsePolarConfig(undefined)).toEqual(POLAR_DEFAULTS)
    expect(
      parsePolarConfig({ source: 'sog', averageSeconds: 7, showDetail: 'no', label: 1 })
    ).toEqual(POLAR_DEFAULTS)
    expect(
      parsePolarConfig({ source: 'vmg', averageSeconds: 30, showDetail: false, label: 'VMG' })
    ).toEqual({ source: 'vmg', averageSeconds: 30, showDetail: false, label: 'VMG' })
  })
})

describe('levels', () => {
  it('turns yellow below 80 % and never red without zones of its own', () => {
    const zones = zonesFor(undefined)
    expect(ratioLevel(0.5, zones)).toBe('warn')
    expect(ratioLevel(0.79, zones)).toBe('warn')
    expect(ratioLevel(0.81, zones)).toBe('ok')
    expect(ratioLevel(1.3, zones)).toBe('ok')
    expect(ratioLevel(0, zones)).toBe('warn')
  })

  it("takes the path's zones when its metadata sets them", () => {
    const zones = zonesFor([
      { upper: 0.6, state: 'alarm' },
      { lower: 0.6, upper: 0.9, state: 'warn' },
      { state: 'bogus' }
    ])
    expect(ratioLevel(0.5, zones)).toBe('alarm')
    expect(ratioLevel(0.85, zones)).toBe('warn')
    expect(ratioLevel(0.95, zones)).toBe('ok')
  })
})

describe('RatioAverage', () => {
  it('averages the values inside the window', () => {
    const a = new RatioAverage()
    a.add(0, 0.5)
    a.add(6000, 0.8)
    a.add(9000, 1)
    expect(a.mean(10_000, 5000, 30_000)).toBeCloseTo(0.9)
    expect(a.mean(10_000, 15_000, 30_000)).toBeCloseTo(0.9)
  })

  it('keeps the last value of a slow sender until it is stale', () => {
    const a = new RatioAverage()
    a.add(0, 0.7)
    expect(a.mean(20_000, 5000, 30_000)).toBe(0.7)
    expect(a.mean(30_000, 5000, 30_000)).toBeUndefined()
  })

  it('starts afresh after the plugin clears the ratio', () => {
    const a = new RatioAverage()
    a.add(0, 0.2)
    a.add(1000, null)
    expect(a.mean(1500, 10_000, 30_000)).toBeUndefined()
    expect(a.noTarget).toBe(true)
    a.add(2000, 0.9)
    expect(a.noTarget).toBe(false)
    expect(a.mean(2500, 10_000, 30_000)).toBe(0.9)
  })

  it('keeps saying there is no target until a value arrives', () => {
    const a = new RatioAverage()
    a.add(0, null)
    expect(a.mean(60_000, 10_000, 30_000)).toBeUndefined()
    expect(a.noTarget).toBe(true)
  })
})

describe('gaugeAngle', () => {
  it('pins values outside the gauge to its ends', () => {
    expect(gaugeAngle(-1)).toBe(gaugeAngle(0))
    expect(gaugeAngle(5)).toBe(gaugeAngle(GAUGE_MAX))
    expect(gaugeAngle(1)).toBeGreaterThan(gaugeAngle(0.5))
  })
})
