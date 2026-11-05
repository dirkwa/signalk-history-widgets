import { describe, expect, it } from 'vitest'
import {
  DEPTH_DEFAULTS,
  depthAxis,
  depthPath,
  depthTitle,
  parseDepthConfig,
  windowLabel
} from '../src/depth-model.js'
import { depthLabel } from '../src/depth-render.js'

const SURFACE = 'environment.depth.belowSurface'
const TRANSDUCER = 'environment.depth.belowTransducer'
const KEEL = 'environment.depth.belowKeel'

describe('parseDepthConfig', () => {
  it('gives the defaults for an empty instance', () => {
    expect(parseDepthConfig({})).toEqual(DEPTH_DEFAULTS)
  })

  it('keeps a known depth and an offered window, and drops the rest', () => {
    expect(parseDepthConfig({ path: KEEL, minutes: 360 })).toEqual({ path: KEEL, minutes: 360 })
    expect(parseDepthConfig({ path: 'navigation.speedOverGround', minutes: 7 })).toEqual(
      DEPTH_DEFAULTS
    )
  })
})

describe('depthPath', () => {
  it('prefers below surface, then transducer, then keel', () => {
    const auto = { path: '', minutes: 30 }
    expect(depthPath(auto, new Set([KEEL, TRANSDUCER, SURFACE]))).toBe(SURFACE)
    expect(depthPath(auto, new Set([KEEL, TRANSDUCER]))).toBe(TRANSDUCER)
    expect(depthPath(auto, new Set([KEEL]))).toBe(KEEL)
    expect(depthPath(auto, new Set())).toBe(TRANSDUCER)
  })

  it('keeps a chosen depth even when the server lacks it right now', () => {
    expect(depthPath({ path: KEEL, minutes: 30 }, new Set([SURFACE]))).toBe(KEEL)
  })
})

describe('labels', () => {
  it('names the depth and the window', () => {
    expect(depthTitle(KEEL)).toBe('Depth below keel')
    expect(windowLabel(15)).toBe('15 min')
    expect(windowLabel(360)).toBe('6 h')
  })
})

describe('depthAxis', () => {
  it('reaches a round depth below the deepest reading in up to four steps', () => {
    expect(depthAxis(12.4)).toEqual({ max: 15, step: 5 })
    expect(depthAxis(3)).toEqual({ max: 4, step: 1 })
    expect(depthAxis(80)).toEqual({ max: 100, step: 25 })
    expect(depthAxis(0)).toEqual({ max: 1, step: 0.25 })
  })

  it('labels marks with the decimals the step needs', () => {
    expect(depthLabel(10, 5)).toBe('10')
    expect(depthLabel(7.5, 2.5)).toBe('7.5')
    expect(depthLabel(0.75, 0.25)).toBe('0.75')
  })
})
