import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STEER_CONFIG,
  ShiftWindow,
  compassText,
  offBow,
  parseSteerConfig,
  sideText,
  steerPaths,
  trueWindAngle,
  trueWindSpeed,
  type Reader,
  type SteerKey
} from '../src/steer-model.js'

const DEG = Math.PI / 180

function reader(values: Partial<Record<SteerKey, number>>): Reader {
  return (key) => values[key]
}

describe('parseSteerConfig', () => {
  it('gives the defaults for an empty instance', () => {
    expect(parseSteerConfig({})).toEqual(DEFAULT_STEER_CONFIG)
  })

  it('keeps valid settings and clamps numbers to their range', () => {
    const c = parseSteerConfig({
      dial: 'wind',
      north: 'magnetic',
      trueWind: 'ground',
      closeHauled: 5,
      shiftSeconds: 99999,
      showRudder: false
    })
    expect(c).toMatchObject({
      dial: 'wind',
      north: 'magnetic',
      trueWind: 'ground',
      closeHauled: 20,
      shiftSeconds: 1800,
      showRudder: false,
      showShift: true
    })
  })

  it('ignores values of the wrong type', () => {
    expect(parseSteerConfig({ dial: 3, closeHauled: 'x', showShift: 'no' })).toEqual(
      DEFAULT_STEER_CONFIG
    )
  })
})

describe('steerPaths', () => {
  it('follows the north reference for directions only', () => {
    const t = steerPaths('true')
    const m = steerPaths('magnetic')
    expect(t.heading).toBe('navigation.headingTrue')
    expect(m.heading).toBe('navigation.headingMagnetic')
    expect(m.waypoint).toBe('navigation.course.calcValues.bearingMagnetic')
    expect(m.angleApparent).toBe(t.angleApparent)
  })
})

describe('trueWindAngle', () => {
  it('uses the water angle for water wind', () => {
    expect(trueWindAngle(reader({ angleTrueWater: 0.5, angleTrueGround: 0.7 }), 'water')).toBe(0.5)
  })

  it('prefers the ground angle for ground wind', () => {
    expect(trueWindAngle(reader({ angleTrueGround: 0.7 }), 'ground')).toBe(0.7)
  })

  it('derives the ground angle from the true direction and heading', () => {
    const a = trueWindAngle(reader({ directionTrue: 10 * DEG, headingTrue: 350 * DEG }), 'ground')
    expect(a).toBeCloseTo(20 * DEG)
  })

  it('has no angle without data', () => {
    expect(trueWindAngle(reader({ directionTrue: 1 }), 'ground')).toBeUndefined()
  })
})

describe('trueWindSpeed', () => {
  it('uses the ground wind speed when there is one', () => {
    expect(trueWindSpeed(reader({ speedTrue: 5, speedOverGroundWind: 6 }), 'ground')).toBe(6)
    expect(trueWindSpeed(reader({ speedTrue: 5 }), 'ground')).toBe(5)
    expect(trueWindSpeed(reader({ speedTrue: 5, speedOverGroundWind: 6 }), 'water')).toBe(5)
  })
})

describe('offBow', () => {
  it('turns a direction into a signed angle off the bow', () => {
    expect(offBow(10 * DEG, 350 * DEG)).toBeCloseTo(20 * DEG)
    expect(offBow(340 * DEG, 10 * DEG)).toBeCloseTo(-30 * DEG)
    expect(offBow(1, undefined)).toBeUndefined()
  })
})

describe('ShiftWindow', () => {
  it('spans the directions of the window across north', () => {
    const w = new ShiftWindow(60_000)
    w.add(0, 355 * DEG)
    w.add(1000, 8 * DEG)
    w.add(2000, 2 * DEG)
    const r = w.range(2000)
    expect(r?.from).toBeCloseTo(355 * DEG)
    expect(r?.to).toBeCloseTo(8 * DEG)
  })

  it('forgets directions older than the window', () => {
    const w = new ShiftWindow(10_000)
    w.add(0, 90 * DEG)
    w.add(5000, 100 * DEG)
    const r = w.range(12_000)
    expect(r?.from).toBeCloseTo(100 * DEG)
    expect(r?.to).toBeCloseTo(100 * DEG)
    expect(w.range(20_000)).toBeUndefined()
  })
})

describe('text', () => {
  it('reads compass directions with three digits', () => {
    expect(compassText(5 * DEG)).toBe('005')
    expect(compassText(359.6 * DEG)).toBe('000')
    expect(compassText(-90 * DEG)).toBe('270')
  })

  it('names the side of an angle off the bow', () => {
    expect(sideText(42 * DEG)).toBe('42° S')
    expect(sideText(-120 * DEG)).toBe('120° P')
    expect(sideText(Math.PI)).toBe('180°')
  })
})
