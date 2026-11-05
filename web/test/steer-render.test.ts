import { describe, expect, it } from 'vitest'
import { sweep } from '../src/steer-render.js'

const DEG = Math.PI / 180

describe('sweep', () => {
  it('measures a sector clockwise, across the bow too', () => {
    expect(sweep(-10 * DEG, 20 * DEG)).toBeCloseTo(30 * DEG)
    expect(sweep(350 * DEG, 10 * DEG)).toBeCloseTo(20 * DEG)
    expect(sweep(0.3, 0.3)).toBe(0)
  })
})
