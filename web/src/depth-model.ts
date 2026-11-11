// The depth profile's settings, which depth it follows and its depth axis.
// No DOM and no bus, so it is unit tested directly.

import { parseTheme, type Theme } from './theme.js'

export const DEPTH_PATHS = [
  { path: 'environment.depth.belowSurface', label: 'Below surface' },
  { path: 'environment.depth.belowTransducer', label: 'Below transducer' },
  { path: 'environment.depth.belowKeel', label: 'Below keel' }
] as const

/** Window lengths offered as buttons, in minutes. */
export const DEPTH_WINDOWS = [5, 15, 30, 60, 180, 360, 720, 1440] as const

export interface DepthConfig {
  /** One of DEPTH_PATHS; empty picks the first the server has. */
  path: string
  minutes: number
  /** The card behind the widget; night mode overrides it. */
  theme: Theme
}

export const DEPTH_DEFAULTS: DepthConfig = { path: '', minutes: 30, theme: 'dark' }

/** Stored state is host data and may be anything; take what is usable. */
export function parseDepthConfig(stored: Record<string, unknown>): DepthConfig {
  const path = DEPTH_PATHS.some((d) => d.path === stored.path) ? String(stored.path) : ''
  const minutes = DEPTH_WINDOWS.find((m) => m === stored.minutes) ?? DEPTH_DEFAULTS.minutes
  return { path, minutes, theme: parseTheme(stored.theme) }
}

/**
 * The depth to draw: the configured one, else the first the server has in
 * DEPTH_PATHS order (below surface reads like a chart, so it comes first),
 * else below transducer, which every sounder reports.
 */
export function depthPath(config: DepthConfig, available: ReadonlySet<string>): string {
  if (config.path) return config.path
  return DEPTH_PATHS.find((d) => available.has(d.path))?.path ?? DEPTH_PATHS[1].path
}

export function depthTitle(path: string): string {
  const known = DEPTH_PATHS.find((d) => d.path === path)
  return known ? `Depth ${known.label.toLowerCase()}` : 'Depth'
}

/** "5 min", "1 h", "24 h". */
export function windowLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${minutes / 60} h`
}

const MAX_INTERVALS = 4

/**
 * The depth axis in display units: from the surface down to a round depth
 * below the deepest reading, with up to four round intervals, so the bottom
 * never touches the frame and the marks read 0, 5, 10, 15.
 */
export function depthAxis(deepest: number): { max: number; step: number } {
  const target = Math.max(deepest * 1.15, 1)
  const raw = target / MAX_INTERVALS
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? 10 * magnitude
  return { max: Math.ceil(target / step) * step, step }
}
