// A widget instance's settings, as the configuration panel stores them in
// the host's per-instance state.

export type SpanUnit = 'min' | 'h'

export interface StripConfig {
  path: string
  /** Shown above the value; empty means the path's short name. */
  label: string
  span: number
  spanUnit: SpanUnit
  /** A unit id from units.ts; empty follows the server's preference. */
  unit: string
  /** Decimal places; negative means automatic. */
  decimals: number
}

export const DEFAULT_CONFIG: StripConfig = {
  path: 'environment.wind.directionTrue',
  label: '',
  span: 30,
  spanUnit: 'min',
  unit: '',
  decimals: -1
}

const MIN_WINDOW_MS = 60_000
const MAX_WINDOW_MS = 7 * 24 * 3_600_000

/** Paths people chart most, with the abbreviation instruments use. */
export const COMMON_PATHS: readonly { path: string; label: string; title: string }[] = [
  { path: 'environment.wind.directionTrue', label: 'TWD', title: 'True wind direction' },
  { path: 'environment.wind.speedTrue', label: 'TWS', title: 'True wind speed' },
  { path: 'environment.wind.angleTrueWater', label: 'TWA', title: 'True wind angle' },
  { path: 'environment.wind.angleApparent', label: 'AWA', title: 'Apparent wind angle' },
  { path: 'environment.wind.speedApparent', label: 'AWS', title: 'Apparent wind speed' },
  { path: 'navigation.speedOverGround', label: 'SOG', title: 'Speed over ground' },
  { path: 'navigation.speedThroughWater', label: 'STW', title: 'Speed through water' },
  { path: 'navigation.courseOverGroundTrue', label: 'COG', title: 'Course over ground' },
  { path: 'navigation.headingTrue', label: 'HDG', title: 'Heading' },
  { path: 'environment.depth.belowTransducer', label: 'Depth', title: 'Depth' },
  { path: 'environment.outside.pressure', label: 'Baro', title: 'Air pressure' },
  { path: 'environment.outside.temperature', label: 'Air', title: 'Air temperature' },
  { path: 'environment.water.temperature', label: 'Water', title: 'Water temperature' }
]

export function labelFor(config: StripConfig): string {
  if (config.label) return config.label
  const known = COMMON_PATHS.find((p) => p.path === config.path)
  return known?.label ?? config.path.split('.').pop() ?? ''
}

export function windowMs(config: StripConfig): number {
  const ms = config.span * (config.spanUnit === 'h' ? 3_600_000 : 60_000)
  return Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, ms))
}

/** Stored state is host data and may be anything; take what is usable. */
export function parseConfig(stored: Record<string, unknown>): StripConfig {
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v.trim() : fallback)
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const span = num(stored.span, DEFAULT_CONFIG.span)
  return {
    path: str(stored.path, DEFAULT_CONFIG.path),
    label: str(stored.label, DEFAULT_CONFIG.label),
    span: span > 0 ? span : DEFAULT_CONFIG.span,
    spanUnit: stored.spanUnit === 'h' ? 'h' : 'min',
    unit: str(stored.unit, DEFAULT_CONFIG.unit),
    decimals: Math.min(4, Math.round(num(stored.decimals, DEFAULT_CONFIG.decimals)))
  }
}

/**
 * Directions (true wind, heading, course) read 0 to 360; other angles, such
 * as the apparent wind angle or roll, are signed.
 */
export function isSignedAngle(path: string): boolean {
  const leaf = path.split('.').pop() ?? ''
  return !/direction|heading|course|bearing/i.test(leaf)
}
