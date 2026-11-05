// The wind steering widget's settings and the angle arithmetic behind its
// dial. Everything the dial draws is an angle off the bow, so the same
// drawing serves a compass card turning with the heading and a fixed
// bow-up wind card.

export type NorthReference = 'true' | 'magnetic'
export type DialMode = 'compass' | 'wind'
export type TrueWindReference = 'water' | 'ground'

export interface SteerConfig {
  /** `compass` turns a compass card under the bow; `wind` shows 0 to 180 port and starboard. */
  dial: DialMode
  north: NorthReference
  trueWind: TrueWindReference
  /** Close-hauled angle off the true wind in degrees, for the tack lines. */
  closeHauled: number
  /** How far back the wind shift fan reaches, in seconds. */
  shiftSeconds: number
  showTackLines: boolean
  showShift: boolean
  showWaypoint: boolean
  showCourse: boolean
  showCurrent: boolean
  showRudder: boolean
}

export const DEFAULT_STEER_CONFIG: SteerConfig = {
  dial: 'compass',
  north: 'true',
  trueWind: 'water',
  closeHauled: 45,
  shiftSeconds: 60,
  showTackLines: true,
  showShift: true,
  showWaypoint: true,
  showCourse: true,
  showCurrent: true,
  showRudder: true
}

export const CLOSE_HAULED_RANGE = { min: 20, max: 80 } as const
export const SHIFT_SECONDS_RANGE = { min: 10, max: 1800 } as const

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Stored state is host data and may be anything; take what is usable. */
export function parseSteerConfig(stored: Record<string, unknown>): SteerConfig {
  const d = DEFAULT_STEER_CONFIG
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  return {
    dial: stored.dial === 'wind' ? 'wind' : 'compass',
    north: stored.north === 'magnetic' ? 'magnetic' : 'true',
    trueWind: stored.trueWind === 'ground' ? 'ground' : 'water',
    closeHauled: clamp(
      Math.round(num(stored.closeHauled, d.closeHauled)),
      CLOSE_HAULED_RANGE.min,
      CLOSE_HAULED_RANGE.max
    ),
    shiftSeconds: clamp(
      Math.round(num(stored.shiftSeconds, d.shiftSeconds)),
      SHIFT_SECONDS_RANGE.min,
      SHIFT_SECONDS_RANGE.max
    ),
    showTackLines: bool(stored.showTackLines, d.showTackLines),
    showShift: bool(stored.showShift, d.showShift),
    showWaypoint: bool(stored.showWaypoint, d.showWaypoint),
    showCourse: bool(stored.showCourse, d.showCourse),
    showCurrent: bool(stored.showCurrent, d.showCurrent),
    showRudder: bool(stored.showRudder, d.showRudder)
  }
}

const TWO_PI = 2 * Math.PI

/** An angle in -π..π. */
export function signed(a: number): number {
  const r = (((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI
  return r - Math.PI
}

/** An angle in 0..2π. */
export function unsigned(a: number): number {
  return ((a % TWO_PI) + TWO_PI) % TWO_PI
}

/** The Signal K paths the widget follows for a north reference. */
export function steerPaths(north: NorthReference) {
  const m = north === 'magnetic'
  return {
    heading: m ? 'navigation.headingMagnetic' : 'navigation.headingTrue',
    course: m ? 'navigation.courseOverGroundMagnetic' : 'navigation.courseOverGroundTrue',
    waypoint: m
      ? 'navigation.course.calcValues.bearingMagnetic'
      : 'navigation.course.calcValues.bearingTrue',
    set: m ? 'environment.current.setMagnetic' : 'environment.current.setTrue',
    headingTrue: 'navigation.headingTrue',
    speedOverGround: 'navigation.speedOverGround',
    drift: 'environment.current.drift',
    rudder: 'steering.rudderAngle',
    angleApparent: 'environment.wind.angleApparent',
    speedApparent: 'environment.wind.speedApparent',
    angleTrueWater: 'environment.wind.angleTrueWater',
    angleTrueGround: 'environment.wind.angleTrueGround',
    directionTrue: 'environment.wind.directionTrue',
    speedTrue: 'environment.wind.speedTrue',
    speedOverGroundWind: 'environment.wind.speedOverGround'
  } as const
}

export type SteerKey = keyof ReturnType<typeof steerPaths>

/** The fresh value of a path, or undefined. */
export type Reader = (key: SteerKey) => number | undefined

/**
 * The true wind angle off the bow. Ground wind falls back to the true
 * direction against the true heading, the form most instruments send.
 */
export function trueWindAngle(read: Reader, ref: TrueWindReference): number | undefined {
  if (ref === 'water') return read('angleTrueWater')
  const angle = read('angleTrueGround')
  if (angle !== undefined) return angle
  const direction = read('directionTrue')
  const heading = read('headingTrue')
  return direction === undefined || heading === undefined ? undefined : signed(direction - heading)
}

/** The true wind speed matching the angle: water wind or ground wind. */
export function trueWindSpeed(read: Reader, ref: TrueWindReference): number | undefined {
  return ref === 'ground' ? (read('speedOverGroundWind') ?? read('speedTrue')) : read('speedTrue')
}

/** A direction (course, bearing, set) as an angle off the bow. */
export function offBow(direction: number | undefined, heading: number | undefined) {
  return direction === undefined || heading === undefined ? undefined : signed(direction - heading)
}

/**
 * The spread of the true wind direction over a sliding window: how far it
 * swung to either side of the latest reading. Directions are kept against
 * the latest one, so the spread stays right across north.
 */
export class ShiftWindow {
  private samples: { time: number; direction: number }[] = []

  constructor(public windowMs: number) {}

  add(time: number, direction: number): void {
    this.samples.push({ time, direction })
    this.prune(time)
  }

  clear(): void {
    this.samples = []
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs
    let drop = 0
    while (drop < this.samples.length && (this.samples[drop]?.time ?? 0) < cutoff) drop++
    if (drop > 0) this.samples.splice(0, drop)
  }

  /** The window's extremes as directions, or undefined when it is empty. */
  range(now: number): { from: number; to: number } | undefined {
    this.prune(now)
    const last = this.samples.at(-1)
    if (!last) return undefined
    let lo = 0
    let hi = 0
    for (const s of this.samples) {
      const off = signed(s.direction - last.direction)
      if (off < lo) lo = off
      if (off > hi) hi = off
    }
    return { from: unsigned(last.direction + lo), to: unsigned(last.direction + hi) }
  }
}

/** A compass reading such as `045`. */
export function compassText(a: number): string {
  const deg = Math.round((unsigned(a) * 180) / Math.PI) % 360
  return String(deg).padStart(3, '0')
}

/** An angle off the bow such as `42° S` or `120° P`. */
export function sideText(a: number): string {
  const deg = Math.round((Math.abs(signed(a)) * 180) / Math.PI)
  if (deg === 0 || deg === 180) return `${deg}°`
  return `${deg}° ${signed(a) < 0 ? 'P' : 'S'}`
}

/**
 * Maps a reading's source timestamp onto the local clock, so a cached
 * reading delivered on subscribe shows its real age. The server's clock may
 * differ from the browser's, so the offset between them is learnt as the
 * smallest gap seen between arrival and source time: the freshest reading
 * sets it. Without a usable timestamp the arrival time stands.
 */
export class SourceClock {
  private offset: number | undefined

  local(arrival: number, timestamp: string | undefined): number {
    const source = timestamp === undefined ? NaN : Date.parse(timestamp)
    if (!Number.isFinite(source)) return arrival
    const gap = arrival - source
    if (this.offset === undefined || gap < this.offset) this.offset = gap
    return source + this.offset
  }
}
