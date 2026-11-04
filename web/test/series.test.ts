import { describe, expect, it } from 'vitest'
import { Series, wrapAngle } from '../src/series.js'

const MIN = 60_000
const deg = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

describe('wrapAngle', () => {
  it('wraps into (-π, π]', () => {
    expect(wrapAngle(deg(190))).toBeCloseTo(deg(-170))
    expect(wrapAngle(deg(-190))).toBeCloseTo(deg(170))
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI)
  })
})

describe('Series', () => {
  it('reports the window minimum, average and maximum of plain values', () => {
    const s = new Series(30 * MIN, false)
    const now = 100 * MIN
    s.add(now - 20 * MIN, 12)
    s.add(now - 10 * MIN, 16)
    s.add(now - 1 * MIN, 20)
    const stats = s.stats(now)
    expect(stats).toMatchObject({ centre: 0, min: 12, max: 20, avg: 16 })
    expect(stats?.bands).toHaveLength(3)
  })

  it('drops what has left the window', () => {
    const s = new Series(30 * MIN, false)
    const now = 100 * MIN
    s.add(now - 40 * MIN, 99)
    s.add(now - 5 * MIN, 5)
    expect(s.stats(now)).toMatchObject({ min: 5, max: 5 })
    expect(s.size).toBe(1)
  })

  it('has nothing to show while empty', () => {
    expect(new Series(MIN, false).stats(MIN)).toBeUndefined()
  })

  it('keeps a wind swinging across north as one narrow band', () => {
    const s = new Series(30 * MIN, true)
    const now = 100 * MIN
    for (const [age, d] of [
      [20, 350],
      [15, 5],
      [10, 355],
      [5, 10]
    ] as const) {
      s.add(now - age * MIN, deg(d))
    }
    const stats = s.stats(now)
    expect(stats).toBeDefined()
    if (!stats) return
    expect(toDeg(stats.max - stats.min)).toBeCloseTo(20)
    expect(toDeg(wrapAngle(stats.centre + stats.min))).toBeCloseTo(-10)
    expect(toDeg(wrapAngle(stats.centre + stats.max))).toBeCloseTo(10)
    expect(stats.avg).toBe(0)
  })

  it('reads a History API row whose min and max straddle north', () => {
    const s = new Series(30 * MIN, true)
    const now = 100 * MIN
    // A provider reporting linear min/max of [0, 2π) values around north.
    s.merge(now - 10 * MIN, deg(2), deg(358), deg(0))
    const stats = s.stats(now)
    expect(stats).toBeDefined()
    if (!stats) return
    expect(toDeg(stats.max - stats.min)).toBeCloseTo(4)
  })

  it('merges rows and readings that share a bucket', () => {
    const s = new Series(30 * MIN, false, 30)
    const now = 100 * MIN
    s.merge(now - 10 * MIN, 4, 8, 6)
    s.add(now - 10 * MIN + 1000, 10)
    const stats = s.stats(now)
    expect(stats?.bands).toHaveLength(1)
    expect(stats).toMatchObject({ min: 4, max: 10, avg: 8 })
  })

  it('places the newest bucket at the top of the strip', () => {
    const s = new Series(30 * MIN, false, 30)
    const now = 100 * MIN
    s.add(now - 30_000, 1)
    const band = s.stats(now)?.bands[0]
    expect(band?.ageStart).toBe(0)
    expect(band?.ageEnd).toBe(60_000)
  })
})
