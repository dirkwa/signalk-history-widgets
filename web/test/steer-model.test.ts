import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STEER_CONFIG,
  ShiftWindow,
  SourceClock,
  CLOCK_WINDOW_MS,
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

describe('SourceClock', () => {
  const at = (ms: number) => new Date(ms).toISOString()

  it('keeps the age of a cached reading', () => {
    const c = new SourceClock()
    expect(c.local(100_000, at(100_000))).toBe(100_000)
    expect(c.local(101_000, at(60_000))).toBe(60_000)
  })

  it('learns a server clock that runs behind or ahead', () => {
    const behind = new SourceClock()
    expect(behind.local(500_000, at(200_000))).toBe(500_000)
    expect(behind.local(501_000, at(201_000))).toBe(501_000)
    const ahead = new SourceClock()
    expect(ahead.local(100_000, at(400_000))).toBe(100_000)
  })

  it('takes the arrival time without a usable timestamp', () => {
    const c = new SourceClock()
    expect(c.local(5000, undefined)).toBe(5000)
    expect(c.local(5000, 'not a date')).toBe(5000)
  })
})

describe('SourceClock window', () => {
  const at = (ms: number) => new Date(ms).toISOString()

  it('lets one timestamp from the future age out', () => {
    const c = new SourceClock()
    c.local(100_000, at(100_000))
    // A reading stamped five minutes ahead pulls the offset down for a while.
    c.local(101_000, at(401_000))
    expect(c.local(102_000, at(102_000))).toBe(-198_000)
    // Live readings keep coming; once it has left the window they read fresh again.
    for (let t = 110_000; t < 102_000 + CLOCK_WINDOW_MS; t += 10_000) c.local(t, at(t))
    const end = 102_000 + CLOCK_WINDOW_MS
    expect(c.local(end, at(end))).toBe(end)
  })
})

describe('SourceClock after a silence', () => {
  const at = (ms: number) => new Date(ms).toISOString()

  it('keeps the offset for a delayed reading after the window emptied', () => {
    const c = new SourceClock()
    c.local(100_000, at(100_000))
    const later = 100_000 + 2 * CLOCK_WINDOW_MS
    expect(c.local(later, at(later - 30_000))).toBe(later - 30_000)
    expect(c.local(later + 1000, at(later + 1000))).toBe(later + 1000)
  })
})

describe('SourceClock after a silence with a changed server clock', () => {
  const at = (ms: number) => new Date(ms).toISOString()

  it('learns the new offset from the next readings', () => {
    const c = new SourceClock()
    c.local(100_000, at(100_000))
    // The server clock now runs 15 s behind; readings come in rarely.
    let t = 100_000 + 2 * CLOCK_WINDOW_MS
    expect(c.local(t, at(t - 15_000))).toBe(t - 15_000)
    t += 1000
    expect(c.local(t, at(t - 15_000))).toBe(t)
    t += 2 * CLOCK_WINDOW_MS
    c.local(t, at(t - 15_000))
    t += 1000
    expect(c.local(t, at(t - 15_000))).toBe(t)
  })
})
