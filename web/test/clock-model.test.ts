import { describe, expect, it } from 'vitest'
import {
  CLOCK_DEFAULTS,
  CLOCK_PATHS,
  BoatZoneReadings,
  boatZone,
  GpsClock,
  clockText,
  clockTitle,
  parseClockConfig,
  serialized
} from '../src/clock-model.js'
import { fitSize, shorten } from '../src/clock-render.js'

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
        label: ' Salon ',
        theme: 'light'
      })
    ).toEqual({
      zone: 'boat',
      hours: '12',
      seconds: true,
      showDate: false,
      label: 'Salon',
      theme: 'light'
    })
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

describe('BoatZoneReadings', () => {
  it('takes the stored zone until the stream reports one', () => {
    const readings = new BoatZoneReadings()
    expect(readings.zone()).toBeUndefined()
    readings.stored(CLOCK_PATHS.offset, 1200)
    expect(readings.zone()).toEqual({ minutes: 720 })
    readings.live(CLOCK_PATHS.region, 'Pacific/Fiji')
    expect(readings.zone()).toEqual({ region: 'Pacific/Fiji' })
  })

  it('never lets a late stored value replace a live one', () => {
    const readings = new BoatZoneReadings()
    readings.live(CLOCK_PATHS.region, 'Pacific/Fiji')
    readings.stored(CLOCK_PATHS.region, 'Europe/Berlin')
    expect(readings.zone()).toEqual({ region: 'Pacific/Fiji' })
    readings.live(CLOCK_PATHS.region, 'Pacific/Auckland')
    expect(readings.zone()).toEqual({ region: 'Pacific/Auckland' })
  })
})

describe('GpsClock', () => {
  const iso = (t: number) => new Date(t).toISOString()
  const HOUR = 3_600_000

  it('corrects a screen clock that is clearly off once GPS time proves live', () => {
    const clock = new GpsClock()
    // The screen runs an hour slow.
    expect(clock.read(NOW - HOUR, iso(NOW))).toBe(0)
    expect(clock.read(NOW - HOUR + 1000, iso(NOW + 1000))).toBe(HOUR)
  })

  it('leaves delivery delay alone', () => {
    const clock = new GpsClock()
    clock.read(NOW + 1500, iso(NOW))
    expect(clock.read(NOW + 2600, iso(NOW + 1000))).toBe(0)
  })

  it('never moves the clock for a replayed or stopped GPS time', () => {
    const clock = new GpsClock()
    // A reading from hours ago, then the same one again.
    clock.read(NOW, iso(NOW - 5 * HOUR))
    expect(clock.read(NOW + 1000, iso(NOW - 5 * HOUR))).toBe(0)
    // A jump that does not match the screen's own step.
    expect(clock.read(NOW + 2000, iso(NOW))).toBe(0)
  })

  it('keeps the last correction through readings it cannot use', () => {
    const clock = new GpsClock()
    clock.read(NOW - HOUR, iso(NOW))
    clock.read(NOW - HOUR + 1000, iso(NOW + 1000))
    expect(clock.read(NOW, 'soon')).toBe(HOUR)
    expect(clock.read(NOW, 12)).toBe(HOUR)
  })
})

describe('clockText', () => {
  it('shows UTC with or without seconds, in 24 or 12 hours', () => {
    expect(clockText(NOW, config({ zone: 'utc' }), undefined, 'en-GB')).toEqual({
      time: '19:45',
      date: 'Thu, 5 Nov 2026',
      zoneName: 'UTC',
      fallback: false
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
    expect(fiji).toEqual({
      time: '07:45',
      date: 'Fri, 6 Nov 2026',
      zoneName: 'Boat time, Fiji',
      fallback: false
    })
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

describe('shorten', () => {
  const fitsIn = (chars: number) => (s: string) => s.length <= chars
  const status = 'Local time (no boat zone)'
  const title = `Flybridge starboard helm · ${status}`

  it('leaves a title that fits alone', () => {
    expect(shorten(title, status, fitsIn(80))).toBe(title)
  })

  it('cuts a long label first and keeps the fallback status whole', () => {
    const narrow = shorten(title, status, fitsIn(36))
    expect(narrow).toBe(`Flybridge… ${status}`)
    expect(narrow.length).toBeLessThanOrEqual(36)
  })

  it('cuts the status only once no label is left', () => {
    expect(shorten(title, status, fitsIn(12))).toBe('Local time…')
    expect(shorten('Salon', '', fitsIn(4))).toBe('Sal…')
  })
})

describe('clockTitle', () => {
  it('shows the label, but keeps the fallback status beside it', () => {
    const labelled = config({ zone: 'boat', label: 'Salon' })
    const fiji = clockText(NOW, labelled, { region: 'Pacific/Fiji' }, 'en-GB')
    expect(clockTitle(labelled, fiji)).toBe('Salon')
    const missing = clockText(NOW, labelled, undefined, 'en-GB')
    expect(clockTitle(labelled, missing)).toBe('Salon · Local time (no boat zone)')
    expect(clockTitle(config({ zone: 'boat' }), missing)).toBe('Local time (no boat zone)')
  })
})

describe('serialized', () => {
  it('runs one at a time and reruns once for calls made meanwhile', async () => {
    const finish: (() => void)[] = []
    let runs = 0
    const run = serialized(() => {
      runs++
      return new Promise<void>((resolve) => finish.push(resolve))
    })
    run()
    run()
    run()
    expect(runs).toBe(1)
    finish.shift()?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runs).toBe(2)
    finish.shift()?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runs).toBe(2)
  })
})
