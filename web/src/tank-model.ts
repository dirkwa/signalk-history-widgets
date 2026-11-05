// The tank widget's settings and the zone logic that colours it. Pure, so it
// runs under the unit tests.

export interface TankConfig {
  /** A tank level path, e.g. `tanks.fuel.0.currentLevel` (ratio 0..1). */
  path: string
  /** Blank shows the tank's name from its metadata or path. */
  label: string
  /** Show the volume left when the tank publishes its capacity. */
  showVolume: boolean
}

export const TANK_DEFAULTS: TankConfig = { path: '', label: '', showVolume: true }

export function parseTankConfig(stored: unknown): TankConfig {
  const s = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  return {
    path: typeof s.path === 'string' ? s.path : TANK_DEFAULTS.path,
    label: typeof s.label === 'string' ? s.label : TANK_DEFAULTS.label,
    showVolume: typeof s.showVolume === 'boolean' ? s.showVolume : TANK_DEFAULTS.showVolume
  }
}

const LEVEL_PATH = /^tanks\.([^.]+)\.([^.]+)\.currentLevel$/

/** Whether a path is a tank level the picker offers. */
export function isTankLevel(path: string): boolean {
  return LEVEL_PATH.test(path)
}

/** The tank's capacity path next to its level path. */
export function capacityPath(levelPath: string): string {
  return levelPath.replace(/\.currentLevel$/, '.capacity')
}

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

/** A readable name from the path: `tanks.freshWater.1.currentLevel` → `Fresh water 1`. */
export function tankName(path: string): string {
  const match = LEVEL_PATH.exec(path)
  if (!match) return path
  const [, fluid = '', id = ''] = match
  const name = FLUID_NAMES[fluid] ?? fluid
  return `${name} ${id}`.trim()
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
