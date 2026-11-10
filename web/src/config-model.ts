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
  { path: 'environment.water.temperature', label: 'Water', title: 'Water temperature' },
  { path: 'performance.polarSpeedRatio', label: 'Polar %', title: 'Boat speed against the polar' },
  {
    path: 'performance.polarVelocityMadeGoodRatio',
    label: 'VMG %',
    title: 'VMG against the polar'
  }
]

// Paths that read against the polar, where 100 % is the line that matters.
const POLAR_RATIO_PATHS: ReadonlySet<string> = new Set([
  'performance.polarSpeedRatio',
  'performance.polarVelocityMadeGoodRatio'
])

/** A value the strip marks and always keeps in view, in the path's SI unit. */
export function referenceFor(path: string): number | undefined {
  return POLAR_RATIO_PATHS.has(path) ? 1 : undefined
}

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

export interface SpanChoice {
  span: number
  spanUnit: SpanUnit
  label: string
}

const choice = (span: number, spanUnit: SpanUnit): SpanChoice => ({
  span,
  spanUnit,
  label: `${span} ${spanUnit}`
})

/** Windows offered as buttons, from a gust to a day. */
export const SPAN_CHOICES: readonly SpanChoice[] = [
  choice(5, 'min'),
  choice(15, 'min'),
  choice(30, 'min'),
  choice(1, 'h'),
  choice(3, 'h'),
  choice(6, 'h'),
  choice(12, 'h'),
  choice(24, 'h')
]

/**
 * The buttons for an instance's window: the offered ones, plus the stored
 * window when it is none of them, so a setting made before keeps showing
 * (as the same span, whichever way it was written) and can stay as it is.
 */
export function spanChoices(config: StripConfig): SpanChoice[] {
  const ms = windowMs(config)
  if (SPAN_CHOICES.some((c) => windowMs({ ...config, ...c }) === ms)) return [...SPAN_CHOICES]
  const own = choice(config.span, config.spanUnit)
  return [...SPAN_CHOICES, own].sort(
    (a, b) => windowMs({ ...config, ...a }) - windowMs({ ...config, ...b })
  )
}
