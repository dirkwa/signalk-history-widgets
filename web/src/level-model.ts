// The fill-level widgets' settings, the kinds of level they show (a tank, a
// battery's state of charge) and the zone logic that colours them. Pure, so it
// runs under the unit tests.

import { parseTheme, type Theme } from './theme.js'

export type LevelKind = 'tank' | 'battery'

/** A shaded 3D cylinder or a flat bar. */
export type LevelStyle = '3d' | 'flat'

export interface LevelConfig {
  /** A 0..1 path, e.g. `tanks.fuel.0.currentLevel`. */
  path: string
  /** Blank shows the name from the path's metadata or the path itself. */
  label: string
  style: LevelStyle
  /** Show the volume left (tank) or the voltage and current (battery) under the level. */
  showDetail: boolean
  /** The card behind the widget; night mode overrides it. */
  theme: Theme
}

export const LEVEL_DEFAULTS: LevelConfig = {
  path: '',
  label: '',
  style: '3d',
  showDetail: true,
  theme: 'dark'
}

export function parseLevelConfig(stored: unknown): LevelConfig {
  const s = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  return {
    path: typeof s.path === 'string' ? s.path : LEVEL_DEFAULTS.path,
    label: typeof s.label === 'string' ? s.label : LEVEL_DEFAULTS.label,
    style: s.style === 'flat' || s.style === '3d' ? s.style : LEVEL_DEFAULTS.style,
    showDetail: typeof s.showDetail === 'boolean' ? s.showDetail : LEVEL_DEFAULTS.showDetail,
    theme: parseTheme(s.theme)
  }
}

const TANK_PATH = /^tanks\.([^.]+)\.([^.]+)\.currentLevel$/
const BATTERY_PATH = /^electrical\.batteries\.([^.]+)\.capacity\.stateOfCharge$/

const FLUID_NAMES: Record<string, string> = {
  fuel: 'Fuel',
  freshWater: 'Fresh water',
  wasteWater: 'Grey water',
  blackWater: 'Black water',
  lubrication: 'Oil',
  liveWell: 'Live well',
  baitWell: 'Bait well',
  ballast: 'Ballast',
  gas: 'Gas'
}

/** What differs between a tank and a battery; the rest is shared. */
export interface KindSpec {
  /** Shown before a path is chosen, and as the picker's section title. */
  noun: string
  plural: string
  /** Whether a path is one of this kind's levels. */
  matches: (path: string) => boolean
  /** A readable name from the path. */
  name: (path: string) => string
  /** The path whose value the detail line shows. */
  detailPath: (levelPath: string) => string
  /** The detail in SI units from the level and the detail path's value. */
  detail: (level: number, value: number) => number
  /** The detail path's Signal K unit, when its metadata has none. */
  detailUnits: string
  detailDecimals: number
  /** A capacity stays true once sent; a voltage goes stale like the level. */
  detailAges: boolean
  /** The path of the current in and out of a battery bank; tanks have none. */
  flowPath?: (levelPath: string) => string
  /** The detail switch in the panel. */
  detailTitle: string
}

export const KINDS: Record<LevelKind, KindSpec> = {
  tank: {
    noun: 'Tank',
    plural: 'Tanks',
    matches: (path) => TANK_PATH.test(path),
    name: (path) => {
      const match = TANK_PATH.exec(path)
      if (!match) return path
      const [, fluid = '', id = ''] = match
      return `${FLUID_NAMES[fluid] ?? fluid} ${id}`.trim()
    },
    detailPath: (path) => path.replace(/\.currentLevel$/, '.capacity'),
    detail: (level, capacity) => level * capacity,
    detailUnits: 'm3',
    detailDecimals: 0,
    detailAges: false,
    detailTitle: "Volume left (needs the tank's capacity)"
  },
  battery: {
    noun: 'Battery',
    plural: 'Battery banks',
    matches: (path) => BATTERY_PATH.test(path),
    name: (path) => {
      const id = BATTERY_PATH.exec(path)?.[1]
      return id === undefined ? path : `Battery ${id}`
    },
    detailPath: (path) => path.replace(/\.capacity\.stateOfCharge$/, '.voltage'),
    detail: (_level, voltage) => voltage,
    detailUnits: 'V',
    detailDecimals: 1,
    detailAges: true,
    flowPath: (path) => path.replace(/\.capacity\.stateOfCharge$/, '.current'),
    detailTitle: "Voltage and current (needs the bank's readings)"
  }
}

/** Below this many amps a bank counts as neither charging nor discharging. */
export const IDLE_AMPS = 0.05

export type Flow = 'charging' | 'discharging' | 'idle'

/** A battery's current is positive while charging (Signal K convention). */
export function flowOf(amps: number): Flow {
  if (amps >= IDLE_AMPS) return 'charging'
  if (amps <= -IDLE_AMPS) return 'discharging'
  return 'idle'
}

/** The Signal K zone states, mildest first. */
export type ZoneState = 'nominal' | 'normal' | 'alert' | 'warn' | 'alarm' | 'emergency'

const SEVERITY: Record<ZoneState, number> = {
  nominal: 0,
  normal: 0,
  alert: 1,
  warn: 2,
  alarm: 3,
  emergency: 4
}

export interface Zone {
  lower?: number
  upper?: number
  state: ZoneState
  message?: string
}

function isZoneState(v: unknown): v is ZoneState {
  return typeof v === 'string' && v in SEVERITY
}

/** The well-formed zones of a path's `meta.zones`; anything else is dropped. */
export function parseZones(raw: unknown): Zone[] {
  if (!Array.isArray(raw)) return []
  const zones: Zone[] = []
  for (const z of raw as unknown[]) {
    if (typeof z !== 'object' || z === null) continue
    const r = z as Record<string, unknown>
    if (!isZoneState(r.state)) continue
    const zone: Zone = { state: r.state }
    if (typeof r.lower === 'number') zone.lower = r.lower
    if (typeof r.upper === 'number') zone.upper = r.upper
    if (typeof r.message === 'string') zone.message = r.message
    zones.push(zone)
  }
  return zones
}

/**
 * The state a value is in: the most severe zone that holds it, `normal` when
 * none does. Bounds are inclusive and a missing bound is open, as the server's
 * own zone notifications treat them.
 */
export function zoneState(value: number, zones: readonly Zone[]): ZoneState {
  let state: ZoneState = 'normal'
  for (const z of zones) {
    if (z.lower !== undefined && value < z.lower) continue
    if (z.upper !== undefined && value > z.upper) continue
    if (SEVERITY[z.state] > SEVERITY[state]) state = z.state
  }
  return state
}

/** Severity groups the widget paints: green, yellow, red. */
export type Level = 'ok' | 'warn' | 'alarm'

export function levelOf(state: ZoneState): Level {
  const s = SEVERITY[state]
  return s >= 3 ? 'alarm' : s >= 1 ? 'warn' : 'ok'
}

/**
 * Zone edges inside 0..1 that are not normal, for the marks beside the tank.
 * Where two zones meet, the mark takes the more severe colour.
 */
export function zoneMarks(zones: readonly Zone[]): { at: number; level: Level }[] {
  const rank: Record<Level, number> = { ok: 0, warn: 1, alarm: 2 }
  const byEdge = new Map<number, Level>()
  for (const z of zones) {
    const level = levelOf(z.state)
    if (level === 'ok') continue
    for (const edge of [z.lower, z.upper]) {
      if (edge === undefined || edge <= 0 || edge >= 1) continue
      const known = byEdge.get(edge)
      if (!known || rank[level] > rank[known]) byEdge.set(edge, level)
    }
  }
  return [...byEdge].map(([at, level]) => ({ at, level })).sort((a, b) => a.at - b.at)
}
