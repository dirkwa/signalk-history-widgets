import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  isSignedAngle,
  labelFor,
  parseConfig,
  windowMs
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
