// The polar performance widget's settings and readings: how close the boat
// sails to its polar, as signalk-polar-performance-plugin publishes it from
// the polar chosen in signalk-polar-management. Pure, so it runs under the
// unit tests.

import { parseTheme, type Theme } from './theme.js'

import { levelOf, parseZones, zoneState, type Level, type Zone } from './level-model.js'

/** Boat speed or VMG, each against what the polar predicts. */
export type PolarSource = 'speed' | 'vmg'

export interface SourceSpec {
  /** Actual divided by polar; 1 is on the polar. */
  ratioPath: string
  /** What the polar predicts, in m/s; the detail line's second number. */
  targetPath: string
  title: string
  /** The panel's button. */
  choice: string
}

export const SOURCES: Record<PolarSource, SourceSpec> = {
  speed: {
    ratioPath: 'performance.polarSpeedRatio',
    targetPath: 'performance.polarSpeed',
    title: 'Polar',
    choice: 'Boat speed'
  },
  vmg: {
    ratioPath: 'performance.polarVelocityMadeGoodRatio',
    targetPath: 'performance.polarVelocityMadeGood',
    title: 'Polar VMG',
    choice: 'VMG'
  }
}

export const AVERAGE_CHOICES = [5, 10, 30] as const

export interface PolarConfig {
  source: PolarSource
  /** Seconds the percentage is averaged over. */
  averageSeconds: number
  /** Show actual / polar speed under the percentage. */
  showDetail: boolean
  /** Blank shows the source's title. */
  label: string
  /** The card behind the widget; night mode overrides it. */
  theme: Theme
}

export const POLAR_DEFAULTS: PolarConfig = {
  source: 'speed',
  averageSeconds: 10,
  showDetail: true,
  label: '',
  theme: 'dark'
}

export function parsePolarConfig(stored: unknown): PolarConfig {
  const s = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  return {
    source: s.source === 'speed' || s.source === 'vmg' ? s.source : POLAR_DEFAULTS.source,
    averageSeconds: AVERAGE_CHOICES.some((c) => c === s.averageSeconds)
      ? (s.averageSeconds as number)
      : POLAR_DEFAULTS.averageSeconds,
    showDetail: typeof s.showDetail === 'boolean' ? s.showDetail : POLAR_DEFAULTS.showDetail,
    label: typeof s.label === 'string' ? s.label : POLAR_DEFAULTS.label,
    theme: parseTheme(s.theme)
  }
}

/** The gauge's full sweep; a boat beating its polar by more is pinned there. */
export const GAUGE_MAX = 1.2

/**
 * Used while the path's metadata has no zones. Sailing below the polar is a
 * trimming hint, not a danger, so nothing turns red.
 */
export const DEFAULT_ZONES: Zone[] = [{ upper: 0.8, state: 'warn' }]

export function zonesFor(metaZones: unknown): Zone[] {
  const zones = parseZones(metaZones)
  return zones.length > 0 ? zones : DEFAULT_ZONES
}

export function ratioLevel(ratio: number, zones: readonly Zone[]): Level {
  return levelOf(zoneState(ratio, zones))
}

/**
 * The ratio averaged over the last few seconds. The plugin sends `null`
 * whenever the polar has no target: in irons, through a tack, in near calm,
 * or without boat speed or a polar. The average starts afresh after one, so
 * the swing back to the polar does not drag old values along.
 */
export class RatioAverage {
  private samples: { time: number; value: number }[] = []
  private cleared = false

  add(time: number, value: number | null): void {
    if (value === null) {
      this.samples = []
      this.cleared = true
      return
    }
    this.cleared = false
    this.samples.push({ time, value })
  }

  /**
   * The plugin's last word was that the polar has no target. It may say so
   * only once, so this holds until a value arrives.
   */
  get noTarget(): boolean {
    return this.cleared
  }

  /**
   * The mean over `windowMs` before `now`. A plugin that reports less often
   * than that still shows its last value, until it is `staleMs` old.
   */
  mean(now: number, windowMs: number, staleMs: number): number | undefined {
    const cutoff = now - windowMs
    while (this.samples.length > 1 && (this.samples[0]?.time ?? Infinity) < cutoff) {
      this.samples.shift()
    }
    const last = this.samples.at(-1)
    if (!last || now - last.time >= staleMs) return undefined
    let sum = 0
    for (const s of this.samples) sum += s.value
    return sum / this.samples.length
  }
}

/**
 * Loads the settings one reload at a time, in order, so the newest settings
 * decide the source and a failed attempt cannot undo a later one. `follow`
 * runs only when the source changes. A failed read or follow is handed to
 * `failed` with the reload, since no settings change may come to retry it.
 */
export function settingsLoader(
  read: () => Promise<PolarConfig>,
  follow: (config: PolarConfig) => Promise<void>,
  failed: (err: unknown, reload: () => Promise<void>) => void
): () => Promise<void> {
  let following: PolarSource | undefined
  let reloads = Promise.resolve()
  const attempt = async (): Promise<void> => {
    try {
      const config = await read()
      if (config.source === following) return
      following = config.source
      try {
        await follow(config)
      } catch (err: unknown) {
        following = undefined
        throw err
      }
    } catch (err: unknown) {
      failed(err, load)
    }
  }
  const load = (): Promise<void> => (reloads = reloads.then(attempt))
  return load
}
