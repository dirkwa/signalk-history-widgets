import { describe, expect, it } from 'vitest'
import {
  TANK_DEFAULTS,
  capacityPath,
  isTankLevel,
  levelOf,
  parseTankConfig,
  parseZones,
  tankName,
  zoneMarks,
  zoneState
} from '../src/tank-model.js'

// The zones a fuel tank typically carries: alarm when nearly empty, warn below a quarter.
const FUEL = parseZones([
  { lower: 0, upper: 0.1, state: 'alarm', message: 'Fuel very low' },
  { lower: 0.1, upper: 0.25, state: 'warn' }
])

describe('parseTankConfig', () => {
  it('falls back to the defaults for missing or mistyped settings', () => {
    expect(parseTankConfig(undefined)).toEqual(TANK_DEFAULTS)
    expect(parseTankConfig({ path: 5, label: null, showVolume: 'yes' })).toEqual(TANK_DEFAULTS)
    expect(
      parseTankConfig({ path: 'tanks.fuel.0.currentLevel', label: 'Port', showVolume: false })
    ).toEqual({
      path: 'tanks.fuel.0.currentLevel',
      label: 'Port',
      showVolume: false
    })
  })
})

describe('tank paths', () => {
  it('recognises tank levels only', () => {
    expect(isTankLevel('tanks.fuel.0.currentLevel')).toBe(true)
    expect(isTankLevel('tanks.fuel.0.capacity')).toBe(false)
    expect(isTankLevel('electrical.batteries.house.capacity.stateOfCharge')).toBe(false)
  })

  it('finds the capacity beside the level', () => {
    expect(capacityPath('tanks.freshWater.1.currentLevel')).toBe('tanks.freshWater.1.capacity')
  })

  it('names a tank from its path', () => {
    expect(tankName('tanks.freshWater.1.currentLevel')).toBe('Fresh water 1')
    expect(tankName('tanks.diesel.port.currentLevel')).toBe('diesel port')
    expect(tankName('some.other.path')).toBe('some.other.path')
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
