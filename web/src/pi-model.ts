// The system health widget's settings and readings: what signalk-rpi-stats
// publishes about the computer Signal K runs on, and when a reading turns
// yellow or red. Pure, so it runs under the unit tests.

import { parseTheme, type Theme } from './theme.js'

import { levelOf, parseZones, zoneState, type Level, type Zone } from './level-model.js'

/** signalk-rpi-stats' default prefix, which the Universal Installer keeps. */
export const STATS_PREFIX = 'environment.rpi'

export type Metric = 'temperature' | 'cpu' | 'memory' | 'storage'

export const METRIC_PATHS: Record<Metric, string> = {
  temperature: `${STATS_PREFIX}.cpu.temperature`,
  cpu: `${STATS_PREFIX}.cpu.utilisation`,
  memory: `${STATS_PREFIX}.memory.utilisation`,
  storage: `${STATS_PREFIX}.storage.utilisation`
}

/** Only read where vcgencmd works, so absent in the installer's container. */
export const THROTTLE_PATHS = {
  underVoltage: `${STATS_PREFIX}.throttling.underVoltage`,
  throttled: `${STATS_PREFIX}.throttling.throttled`
} as const

const CELSIUS = 273.15

/**
 * Used while the path's metadata has no zones. A Raspberry Pi slows its CPU
 * down from 80 °C; the bars turn yellow when the computer runs short.
 */
export const DEFAULT_ZONES: Record<Metric, Zone[]> = {
  temperature: [
    { lower: CELSIUS + 70, upper: CELSIUS + 80, state: 'warn' },
    { lower: CELSIUS + 80, state: 'alarm' }
  ],
  cpu: [
    { lower: 0.8, upper: 0.95, state: 'warn' },
    { lower: 0.95, state: 'alarm' }
  ],
  memory: [
    { lower: 0.8, upper: 0.9, state: 'warn' },
    { lower: 0.9, state: 'alarm' }
  ],
  storage: [
    { lower: 0.85, upper: 0.95, state: 'warn' },
    { lower: 0.95, state: 'alarm' }
  ]
}

/** The zones from the path's metadata, or the defaults when it sets none. */
export function zonesFor(metric: Metric, metaZones: unknown): Zone[] {
  const zones = parseZones(metaZones)
  return zones.length > 0 ? zones : DEFAULT_ZONES[metric]
}

export function metricLevel(value: number, zones: readonly Zone[]): Level {
  return levelOf(zoneState(value, zones))
}

export interface PiConfig {
  /** Blank shows `System`. */
  label: string
  showStorage: boolean
  /** The card behind the widget; night mode overrides it. */
  theme: Theme
}

export const PI_DEFAULTS: PiConfig = { label: '', showStorage: false, theme: 'dark' }

export function parsePiConfig(stored: unknown): PiConfig {
  const s = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  return {
    label: typeof s.label === 'string' ? s.label : PI_DEFAULTS.label,
    showStorage: typeof s.showStorage === 'boolean' ? s.showStorage : PI_DEFAULTS.showStorage,
    theme: parseTheme(s.theme)
  }
}

export type BarMetric = Exclude<Metric, 'temperature'>

/** The bars under the temperature, in the order they are drawn. */
export function barMetrics(config: PiConfig): BarMetric[] {
  return config.showStorage ? ['cpu', 'memory', 'storage'] : ['cpu', 'memory']
}

export const BAR_LABELS: Record<BarMetric, string> = {
  cpu: 'CPU',
  memory: 'RAM',
  storage: 'Disk'
}

/** What replaces the title while the Pi reports a power or heat problem. */
export function throttleWarning(flags: {
  underVoltage?: boolean
  throttled?: boolean
}): string | undefined {
  if (flags.underVoltage) return 'Low voltage'
  if (flags.throttled) return 'Throttled'
  return undefined
}
