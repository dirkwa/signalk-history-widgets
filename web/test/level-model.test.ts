import { describe, expect, it } from 'vitest'
import {
  flowOf,
  KINDS,
  LEVEL_DEFAULTS,
  levelOf,
  parseLevelConfig,
  parseZones,
  zoneMarks,
  zoneState
} from '../src/level-model.js'

// The zones a fuel tank typically carries: alarm when nearly empty, warn below a quarter.
const FUEL = parseZones([
  { lower: 0, upper: 0.1, state: 'alarm', message: 'Fuel very low' },
  { lower: 0.1, upper: 0.25, state: 'warn' }
])

describe('parseLevelConfig', () => {
  it('falls back to the defaults for missing or mistyped settings', () => {
    expect(parseLevelConfig(undefined)).toEqual(LEVEL_DEFAULTS)
    expect(parseLevelConfig({ path: 5, label: null, style: 'round', showDetail: 'yes' })).toEqual(
      LEVEL_DEFAULTS
    )
    expect(
      parseLevelConfig({
        path: 'tanks.fuel.0.currentLevel',
        label: 'Port',
        style: 'flat',
        showDetail: false
      })
    ).toEqual({
      path: 'tanks.fuel.0.currentLevel',
      label: 'Port',
      style: 'flat',
      showDetail: false
    })
  })
})

describe('tanks', () => {
  const tank = KINDS.tank

  it('recognises tank levels only', () => {
    expect(tank.matches('tanks.fuel.0.currentLevel')).toBe(true)
    expect(tank.matches('tanks.fuel.0.capacity')).toBe(false)
    expect(tank.matches('electrical.batteries.house.capacity.stateOfCharge')).toBe(false)
  })

  it('shows the volume left from the capacity beside the level', () => {
    expect(tank.detailPath('tanks.freshWater.1.currentLevel')).toBe('tanks.freshWater.1.capacity')
    expect(tank.detail(0.42, 0.4)).toBeCloseTo(0.168)
    expect(tank.detailAges).toBe(false)
  })

  it('names a tank from its path', () => {
    expect(tank.name('tanks.freshWater.1.currentLevel')).toBe('Fresh water 1')
    expect(tank.name('tanks.diesel.port.currentLevel')).toBe('diesel port')
    expect(tank.name('some.other.path')).toBe('some.other.path')
  })
})

describe('batteries', () => {
  const battery = KINDS.battery

  it('recognises a bank state of charge only', () => {
    expect(battery.matches('electrical.batteries.house.capacity.stateOfCharge')).toBe(true)
    expect(battery.matches('electrical.batteries.house.voltage')).toBe(false)
    expect(battery.matches('tanks.fuel.0.currentLevel')).toBe(false)
  })

  it("shows the bank's voltage, which goes stale like the level", () => {
    expect(battery.detailPath('electrical.batteries.house.capacity.stateOfCharge')).toBe(
      'electrical.batteries.house.voltage'
    )
    expect(battery.detail(0.82, 12.8)).toBe(12.8)
    expect(battery.detailAges).toBe(true)
  })

  it("shows the bank's current, charging when positive", () => {
    expect(battery.flowPath?.('electrical.batteries.house.capacity.stateOfCharge')).toBe(
      'electrical.batteries.house.current'
    )
    expect(flowOf(12.5)).toBe('charging')
    expect(flowOf(-3.2)).toBe('discharging')
    expect(flowOf(0.01)).toBe('idle')
    expect(flowOf(-0.01)).toBe('idle')
  })

  it('names a bank from its path', () => {
    expect(battery.name('electrical.batteries.house.capacity.stateOfCharge')).toBe('Battery house')
    expect(battery.name('x')).toBe('x')
  })
})

describe('zones', () => {
  it('drops malformed zones', () => {
    expect(parseZones('nope')).toEqual([])
    expect(parseZones([{ lower: 0, upper: 1, state: 'bogus' }, null, { state: 'warn' }])).toEqual([
      { state: 'warn' }
    ])
  })

  it('finds the state of a level, most severe zone first', () => {
    expect(zoneState(0.05, FUEL)).toBe('alarm')
    expect(zoneState(0.1, FUEL)).toBe('alarm')
    expect(zoneState(0.2, FUEL)).toBe('warn')
    expect(zoneState(0.6, FUEL)).toBe('normal')
    expect(zoneState(0.6, [])).toBe('normal')
  })

  it('treats a missing bound as open', () => {
    const full = parseZones([{ lower: 0.9, state: 'alert' }])
    expect(zoneState(0.95, full)).toBe('alert')
    expect(zoneState(1.2, full)).toBe('alert')
    expect(zoneState(0.5, full)).toBe('normal')
  })

  it('paints green, yellow or red', () => {
    expect(levelOf('nominal')).toBe('ok')
    expect(levelOf('normal')).toBe('ok')
    expect(levelOf('alert')).toBe('warn')
    expect(levelOf('warn')).toBe('warn')
    expect(levelOf('alarm')).toBe('alarm')
    expect(levelOf('emergency')).toBe('alarm')
  })

  it('marks the inner edges of the zones that are not normal', () => {
    expect(zoneMarks(FUEL)).toEqual([
      { at: 0.1, level: 'alarm' },
      { at: 0.25, level: 'warn' }
    ])
    expect(zoneMarks(parseZones([{ lower: 0.25, upper: 1, state: 'normal' }]))).toEqual([])
  })
})
