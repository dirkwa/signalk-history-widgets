import { describe, expect, it } from 'vitest'
import { timeTicks, valueAxis } from '../src/render.js'

describe('timeTicks', () => {
  it('marks 10, 20 and 30 minutes on a 30 minute strip', () => {
    expect(timeTicks(30 * 60_000).map((t) => t.label)).toEqual(['10', '20', '30'])
  })

  it('marks hours on a day', () => {
    expect(timeTicks(24 * 3_600_000).map((t) => t.label)).toEqual(['6h', '12h', '18h', '24h'])
  })
})

describe('valueAxis', () => {
  it('pads the window range', () => {
    const axis = valueAxis({ centre: 0, min: 10, max: 20, avg: 15, bands: [] }, 1)
    expect(axis.lo).toBeCloseTo(9.5)
    expect(axis.hi).toBeCloseTo(20.5)
  })

  it('widens a steady value to the minimum span', () => {
    const axis = valueAxis({ centre: 0, min: 5, max: 5, avg: 5, bands: [] }, 2)
    expect(axis.hi - axis.lo).toBeCloseTo(2.2)
  })
})
