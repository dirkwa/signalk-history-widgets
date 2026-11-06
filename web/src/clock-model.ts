// The clock widget's settings, the time zone it shows and the text it draws.
// No DOM and no bus, so it is unit tested directly.

export type ClockZone = 'local' | 'utc' | 'boat'
export type HourCycle = '24' | '12'

export interface ClockConfig {
  /** `local` is this screen's zone, `boat` the zone the server reports. */
  zone: ClockZone
  hours: HourCycle
  seconds: boolean
  showDate: boolean
  label: string
}

export const CLOCK_DEFAULTS: ClockConfig = {
  zone: 'local',
  hours: '24',
  seconds: false,
  showDate: true,
  label: ''
}

/** Stored state is host data and may be anything; take what is usable. */
export function parseClockConfig(stored: Record<string, unknown>): ClockConfig {
  const d = CLOCK_DEFAULTS
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  return {
    zone: stored.zone === 'utc' || stored.zone === 'boat' ? stored.zone : d.zone,
    hours: stored.hours === '12' ? '12' : d.hours,
    seconds: bool(stored.seconds, d.seconds),
    showDate: bool(stored.showDate, d.showDate),
    label: typeof stored.label === 'string' ? stored.label.trim() : d.label
  }
}

/** Signal K paths the clock reads. */
export const CLOCK_PATHS = {
  gpsTime: 'navigation.datetime',
  region: 'environment.time.timezoneRegion',
  offset: 'environment.time.timezoneOffset'
} as const

/** Where a zone comes from: a tz database name, or a fixed offset in minutes. */
export type ZoneSource = { region: string } | { minutes: number } | undefined

function validRegion(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name })
    return true
  } catch {
    return false
  }
}

/**
 * The boat's zone from the server: `timezoneRegion` (a tz database name)
 * wins, since it follows daylight saving; otherwise `timezoneOffset`, which
 * Signal K gives as (-)hhmm, so 1200 is UTC+12:00 and -530 is UTC-05:30.
 */
export function boatZone(region: unknown, offset: unknown): ZoneSource {
  if (typeof region === 'string' && region && validRegion(region)) return { region }
  if (typeof offset === 'number' && Number.isFinite(offset)) {
    const abs = Math.abs(Math.trunc(offset))
    const minutes = Math.floor(abs / 100) * 60 + (abs % 100)
    if (abs % 100 < 60 && minutes <= 14 * 60) return { minutes: offset < 0 ? -minutes : minutes }
  }
  return undefined
}

/**
 * The boat zone's two paths from both sources: the stored value read once at
 * start and the stream. Either may arrive first; a stored value never
 * replaces one the stream has already delivered, since it may be older.
 */
export class BoatZoneReadings {
  private readonly values = new Map<string, unknown>()

  live(path: string, value: unknown): void {
    this.values.set(path, value)
  }

  stored(path: string, value: unknown): void {
    if (!this.values.has(path)) this.values.set(path, value)
  }

  zone(): ZoneSource {
    return boatZone(this.values.get(CLOCK_PATHS.region), this.values.get(CLOCK_PATHS.offset))
  }
}

/** A screen clock this far off GPS time is corrected; closer, it is trusted. */
export const CORRECT_BEYOND_MS = 2000

/** Two GPS times this far apart in the screen's time still count as live. */
export const LIVE_STEP_MS = 60_000
/** How much two live GPS times may disagree with the screen about their gap. */
export const STEP_TOLERANCE_MS = 1000

/**
 * How far to move the screen's clock to match GPS time. Screens without a
 * network or a real-time clock can boot hours off; small differences are
 * delivery delay and are left alone. A GPS time counts only once the next
 * one confirms it is live: both must advance as far as the screen's clock
 * did between their arrivals. A replayed old reading, or one from a GPS that
 * has since gone quiet, is never followed by such a step, so it never moves
 * the clock.
 */
export class GpsClock {
  correction = 0
  private last: { arrival: number; gps: number } | undefined

  /** Takes a GPS time that arrived at `arrival` on the screen's clock. */
  read(arrival: number, gpsTime: unknown): number {
    const gps = typeof gpsTime === 'string' ? Date.parse(gpsTime) : NaN
    if (!Number.isFinite(gps)) return this.correction
    const last = this.last
    this.last = { arrival, gps }
    if (!last) return this.correction
    const step = gps - last.gps
    const live =
      step > 0 &&
      step <= LIVE_STEP_MS &&
      Math.abs(step - (arrival - last.arrival)) <= STEP_TOLERANCE_MS
    if (live) {
      const offset = gps - arrival
      this.correction = Math.abs(offset) > CORRECT_BEYOND_MS ? offset : 0
    }
    return this.correction
  }
}

function offsetName(minutes: number): string {
  if (minutes === 0) return 'UTC'
  const abs = Math.abs(minutes)
  const hh = Math.floor(abs / 60)
  const mm = abs % 60
  return `UTC${minutes < 0 ? '-' : '+'}${hh}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`
}

export interface ClockText {
  time: string
  date: string
  /** Which zone the time is in, for the line above it. */
  zoneName: string
  /** Boat time was chosen but the server gives no zone, so this is local time. */
  fallback: boolean
}

/**
 * The text for instant `now` in the configured zone. A boat zone the server
 * does not report falls back to this screen's zone and says so. `locale` is
 * for tests; the widget uses the browser's.
 */
export function clockText(
  now: number,
  config: ClockConfig,
  boat: ZoneSource,
  locale?: string
): ClockText {
  let timeZone: string | undefined
  let instant = now
  let zoneName: string
  const fallback = config.zone === 'boat' && boat === undefined
  if (config.zone === 'utc') {
    timeZone = 'UTC'
    zoneName = 'UTC'
  } else if (config.zone === 'boat' && boat && 'region' in boat) {
    timeZone = boat.region
    zoneName = `Boat time, ${boat.region.split('/').pop()?.replace(/_/g, ' ') ?? boat.region}`
  } else if (config.zone === 'boat' && boat && 'minutes' in boat) {
    timeZone = 'UTC'
    instant = now + boat.minutes * 60_000
    zoneName = `Boat time, ${offsetName(boat.minutes)}`
  } else {
    zoneName = fallback ? 'Local time (no boat zone)' : 'Local time'
  }
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: config.seconds ? '2-digit' : undefined,
    hourCycle: config.hours === '12' ? 'h12' : 'h23'
  }).format(instant)
  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(instant)
  return { time, date, zoneName, fallback }
}

/** The line above the time: the label if set, but never hiding a fallback. */
export function clockTitle(config: ClockConfig, text: ClockText): string {
  if (!config.label) return text.zoneName
  return text.fallback ? `${config.label} · ${text.zoneName}` : config.label
}

/**
 * Runs `task` one call at a time. A call made while it runs queues a single
 * rerun, so the last result always comes from a run that started after the
 * last call: an older settings snapshot can never land after a newer one.
 */
export function serialized(task: () => Promise<void>): () => void {
  let running = false
  let again = false
  const run = (): void => {
    if (running) {
      again = true
      return
    }
    running = true
    void task().finally(() => {
      running = false
      if (again) {
        again = false
        run()
      }
    })
  }
  return run
}
