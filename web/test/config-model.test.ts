import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  isSignedAngle,
  labelFor,
  referenceFor,
  parseConfig,
  spanChoices,
  windowMs,
  type StripConfig
} from '../src/config-model.js'

describe('parseConfig', () => {
  it('starts from the defaults', () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG)
  })

  it('takes valid settings and drops the rest', () => {
    expect(
      parseConfig({
        path: ' environment.wind.speedTrue ',
        span: 24,
        spanUnit: 'h',
        decimals: 'x',
        unit: 7
      })
    ).toEqual({ ...DEFAULT_CONFIG, path: 'environment.wind.speedTrue', span: 24, spanUnit: 'h' })
    expect(parseConfig({ span: -5 }).span).toBe(DEFAULT_CONFIG.span)
  })
})

describe('windowMs', () => {
  it('converts the span and keeps it within a minute and a week', () => {
    expect(windowMs({ ...DEFAULT_CONFIG, span: 30 })).toBe(1_800_000)
    expect(windowMs({ ...DEFAULT_CONFIG, span: 24, spanUnit: 'h' })).toBe(86_400_000)
    expect(windowMs({ ...DEFAULT_CONFIG, span: 0.1 })).toBe(60_000)
    expect(windowMs({ ...DEFAULT_CONFIG, span: 1000, spanUnit: 'h' })).toBe(7 * 86_400_000)
  })
})

describe('labelFor', () => {
  it('uses the instrument abbreviation for a common path', () => {
    expect(labelFor({ ...DEFAULT_CONFIG, path: 'environment.wind.angleApparent' })).toBe('AWA')
    expect(labelFor({ ...DEFAULT_CONFIG, path: 'electrical.batteries.house.voltage' })).toBe(
      'voltage'
    )
    expect(labelFor({ ...DEFAULT_CONFIG, label: 'Wind' })).toBe('Wind')
  })
})

describe('isSignedAngle', () => {
  it('reads directions 0 to 360 and other angles signed', () => {
    expect(isSignedAngle('environment.wind.directionTrue')).toBe(false)
    expect(isSignedAngle('navigation.headingMagnetic')).toBe(false)
    expect(isSignedAngle('navigation.courseOverGroundTrue')).toBe(false)
    expect(isSignedAngle('environment.wind.angleApparent')).toBe(true)
    expect(isSignedAngle('steering.rudderAngle')).toBe(true)
  })
})

describe('spanChoices', () => {
  const labels = (c: StripConfig) => spanChoices(c).map((s) => s.label)

  it('offers the windows from 5 minutes to 24 hours', () => {
    expect(labels(DEFAULT_CONFIG)).toEqual([
      '5 min',
      '15 min',
      '30 min',
      '1 h',
      '3 h',
      '6 h',
      '12 h',
      '24 h'
    ])
  })

  it('treats 60 minutes as the offered hour', () => {
    expect(spanChoices({ ...DEFAULT_CONFIG, span: 60 })).toHaveLength(8)
  })

  it('keeps a window set before, in its place', () => {
    expect(labels({ ...DEFAULT_CONFIG, span: 45 })).toEqual([
      '5 min',
      '15 min',
      '30 min',
      '45 min',
      '1 h',
      '3 h',
      '6 h',
      '12 h',
      '24 h'
    ])
    expect(labels({ ...DEFAULT_CONFIG, span: 48, spanUnit: 'h' }).at(-1)).toBe('48 h')
  })
})

describe('referenceFor', () => {
  it('marks 100 % on the polar ratios', () => {
    expect(referenceFor('performance.polarSpeedRatio')).toBe(1)
    expect(referenceFor('performance.polarVelocityMadeGoodRatio')).toBe(1)
  })

  it('marks nothing on other ratios', () => {
    expect(referenceFor('electrical.batteries.house.capacity.stateOfCharge')).toBeUndefined()
  })
})
