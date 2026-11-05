import { describe, expect, it } from 'vitest'
import {
  CLOCK_DEFAULTS,
  CORRECT_BEYOND_MS,
  boatZone,
  clockCorrection,
  clockText,
  parseClockConfig
} from '../src/clock-model.js'
import { fitSize } from '../src/clock-render.js'

// Thursday 5 November 2026, 19:45:30 UTC.
const NOW = Date.UTC(2026, 10, 5, 19, 45, 30)
const config = (over: Partial<typeof CLOCK_DEFAULTS> = {}) => ({ ...CLOCK_DEFAULTS, ...over })

describe('parseClockConfig', () => {
  it('gives the defaults for an empty instance', () => {
    expect(parseClockConfig({})).toEqual(CLOCK_DEFAULTS)
  })

  it('keeps valid settings and drops the rest', () => {
    expect(
      parseClockConfig({
        zone: 'boat',
        hours: '12',
        seconds: true,
        showDate: false,
        label: ' Salon '
      })
    ).toEqual({ zone: 'boat', hours: '12', seconds: true, showDate: false, label: 'Salon' })
    expect(parseClockConfig({ zone: 'mars', hours: 13, seconds: 'yes', label: 4 })).toEqual(
      CLOCK_DEFAULTS
    )
  })
})

describe('boatZone', () => {
  it('prefers a valid tz database name', () => {
    expect(boatZone('Pacific/Fiji', 1200)).toEqual({ region: 'Pacific/Fiji' })
    expect(boatZone('Nowhere/Atlantis', 1200)).toEqual({ minutes: 720 })
  })

  it('reads the offset as (-)hhmm', () => {
    expect(boatZone(undefined, 1200)).toEqual({ minutes: 720 })
    expect(boatZone(undefined, -530)).toEqual({ minutes: -330 })
    expect(boatZone(undefined, 0)).toEqual({ minutes: 0 })
  })

  it('ignores offsets that are not a clock offset', () => {
    expect(boatZone(undefined, 1290)).toBeUndefined()
    expect(boatZone(undefined, 2000)).toBeUndefined()
    expect(boatZone(undefined, 'x')).toBeUndefined()
    expect(boatZone(undefined, undefined)).toBeUndefined()
  })
})

describe('clockCorrection', () => {
  it('corrects a screen clock that is clearly off', () => {
    const gps = new Date(NOW).toISOString()
    expect(clockCorrection(NOW - 3_600_000, gps)).toBe(3_600_000)
    expect(clockCorrection(NOW + 5000, gps)).toBe(-5000)
  })

  it('leaves delivery delay alone and ignores what is not a time', () => {
    expect(clockCorrection(NOW + CORRECT_BEYOND_MS, new Date(NOW).toISOString())).toBe(0)
    expect(clockCorrection(NOW, 'soon')).toBeUndefined()
    expect(clockCorrection(NOW, 12)).toBeUndefined()
  })
})

describe('clockText', () => {
  it('shows UTC with or without seconds, in 24 or 12 hours', () => {
    expect(clockText(NOW, config({ zone: 'utc' }), undefined, 'en-GB')).toEqual({
      time: '19:45',
      date: 'Thu, 5 Nov 2026',
      zoneName: 'UTC'
    })
    expect(clockText(NOW, config({ zone: 'utc', seconds: true }), undefined, 'en-GB').time).toBe(
      '19:45:30'
    )
    expect(clockText(NOW, config({ zone: 'utc', hours: '12' }), undefined, 'en-US').time).toBe(
      '07:45 PM'
    )
  })

  it('shows the boat zone by name or by offset, across midnight', () => {
    const fiji = clockText(NOW, config({ zone: 'boat' }), { region: 'Pacific/Fiji' }, 'en-GB')
    expect(fiji).toEqual({ time: '07:45', date: 'Fri, 6 Nov 2026', zoneName: 'Boat time, Fiji' })
    const offset = clockText(NOW, config({ zone: 'boat' }), { minutes: -330 }, 'en-GB')
    expect(offset).toMatchObject({ time: '14:15', zoneName: 'Boat time, UTC-5:30' })
  })

  it('falls back to local time and says so when the boat zone is unknown', () => {
    expect(clockText(NOW, config({ zone: 'boat' }), undefined, 'en-GB').zoneName).toBe(
      'Local time (no boat zone)'
    )
    expect(clockText(NOW, config(), { region: 'Pacific/Fiji' }, 'en-GB').zoneName).toBe(
      'Local time'
    )
  })
})

describe('fitSize', () => {
  it('shrinks text until it fits, but not below a readable floor', () => {
    const measure = (px: number) => px * 5
    expect(fitSize(measure, 500, 80)).toBe(80)
    expect(fitSize(measure, 200, 80)).toBe(40)
    expect(fitSize(measure, 1, 80)).toBe(7)
  })
})
