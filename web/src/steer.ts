// The wind steering widget: heading, apparent and true wind, the close-hauled
// headings on either tack, the recent wind shift, the next waypoint, course
// over ground, current and rudder on one dial. Settings come from the
// instance state the configuration panel writes.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { installLongPress, followNightMode } from './host.js'
import { fetchMeta } from './signalk.js'
import {
  ShiftWindow,
  SourceClock,
  offBow,
  parseSteerConfig,
  sideText,
  steerPaths,
  trueWindAngle,
  trueWindSpeed,
  unsigned,
  type Reader,
  type SteerConfig,
  type SteerKey
} from './steer-model.js'
import { STEER_DAY, STEER_NIGHT, drawSteer, type Readout, type SteerFrame } from './steer-render.js'
import { convert, resolveDisplay, type Display } from './units.js'
import './styles.css'

// A reading older than this is hidden rather than shown as current.
const STALE_MS = 10_000
const DEG = Math.PI / 180
// Below these, in m/s, course over ground and current point nowhere useful.
const MIN_SOG = 0.1
const MIN_DRIFT = 0.05
// The current arrow reaches full length at this drift, m/s (about 2 kn).
const FULL_DRIFT = 1
const REDRAW_MS = 1000
const WIND_KEYS: ReadonlySet<SteerKey> = new Set([
  'angleTrueWater',
  'angleTrueGround',
  'directionTrue'
])

interface State {
  config: SteerConfig
  values: Map<SteerKey, { time: number; value: number }>
  shift: ShiftWindow
  clock: SourceClock
  speed: Display
}

const canvas = document.createElement('canvas')
document.getElementById('root')?.append(canvas)
let state: State | undefined
let night = false
let generation = 0
let unsubscribe: (() => Promise<void>) | undefined
let drawQueued = false

function reader(s: State, now: number): Reader {
  return (key) => {
    const v = s.values.get(key)
    return v && now - v.time < STALE_MS ? v.value : undefined
  }
}

function speedReadout(label: string, si: number | undefined, d: Display): Readout {
  return {
    label,
    value: si === undefined ? '--' : convert(si, d.conversion).toFixed(d.decimals),
    unit: d.symbol
  }
}

function angleReadout(label: string, a: number | undefined): Readout {
  return { label, value: a === undefined ? '--' : sideText(a), unit: '' }
}

function frame(now: number): SteerFrame {
  const palette = night ? STEER_NIGHT : STEER_DAY
  const blank = { label: '', value: '', unit: '' }
  const s = state
  if (!s) {
    return {
      dial: 'compass',
      topLeft: blank,
      topRight: blank,
      bottomLeft: blank,
      bottomRight: blank,
      palette
    }
  }
  const c = s.config
  const read = reader(s, now)
  const heading = read('heading')
  const apparent = read('angleApparent')
  const trueWind = trueWindAngle(read, c.trueWind)
  const sog = read('speedOverGround')
  const drift = read('drift')
  const set = offBow(read('set'), heading)

  const shift = c.showShift && heading !== undefined ? s.shift.range(now) : undefined
  const f: SteerFrame = {
    dial: c.dial,
    heading,
    apparent,
    trueWind,
    shift:
      shift && heading !== undefined
        ? { from: shift.from - heading, to: shift.to - heading }
        : undefined,
    closeHauled: c.showTackLines ? c.closeHauled * DEG : undefined,
    waypoint: c.showWaypoint ? offBow(read('waypoint'), heading) : undefined,
    course:
      c.showCourse && sog !== undefined && sog >= MIN_SOG
        ? offBow(read('course'), heading)
        : undefined,
    current:
      c.showCurrent && set !== undefined && drift !== undefined && drift >= MIN_DRIFT
        ? {
            angle: set,
            fraction: drift / FULL_DRIFT,
            text: `${convert(drift, s.speed.conversion).toFixed(1)} ${s.speed.symbol}`
          }
        : undefined,
    rudder: c.showRudder ? read('rudder') : undefined,
    topLeft: speedReadout('AWS', read('speedApparent'), s.speed),
    topRight: speedReadout('TWS', trueWindSpeed(read, c.trueWind), s.speed),
    bottomLeft: angleReadout('AWA', apparent),
    bottomRight: angleReadout('TWA', trueWind),
    palette
  }
  return f
}

function render(): void {
  drawQueued = false
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(rect.width * ratio))
  const h = Math.max(1, Math.round(rect.height * ratio))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  drawSteer(ctx, rect.width, rect.height, frame(Date.now()))
}

function queueRender(): void {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(render)
}

/** Feeds the shift window with the true wind as a direction. */
function recordShift(s: State, now: number): void {
  const read = reader(s, now)
  const heading = read('heading')
  const angle = trueWindAngle(read, s.config.trueWind)
  if (heading !== undefined && angle !== undefined) s.shift.add(now, unsigned(heading + angle))
}

async function apply(client: ExtensionClient): Promise<void> {
  const mine = ++generation
  const config = parseSteerConfig(await client.state.get())
  const paths = steerPaths(config.north)
  const meta = await fetchMeta(paths.speedApparent)
  if (mine !== generation) return
  const s: State = {
    config,
    values: new Map(),
    shift: new ShiftWindow(config.shiftSeconds * 1000),
    clock: new SourceClock(),
    // Wind speeds are m/s in Signal K; without it the readouts lose their unit.
    speed: resolveDisplay({ ...meta, units: meta?.units ?? 'm/s' }, undefined, 1)
  }
  // With true north, the heading and the true heading are the same path.
  const byPath = new Map<string, SteerKey[]>()
  for (const [key, path] of Object.entries(paths) as [SteerKey, string][]) {
    byPath.set(path, [...(byPath.get(path) ?? []), key])
  }
  // The old subscription keeps the dial live until the new one is in place.
  const next = await client.signalk.subscribe([...byPath.keys()], (ev) => {
    const keys = byPath.get(ev.path)
    if (!keys || typeof ev.value !== 'number' || !Number.isFinite(ev.value)) return
    const now = Date.now()
    const time = s.clock.local(now, ev.timestamp)
    for (const key of keys) s.values.set(key, { time, value: ev.value })
    if (keys.some((k) => WIND_KEYS.has(k))) recordShift(s, now)
    queueRender()
  })
  if (mine !== generation) {
    await next().catch(() => undefined)
    return
  }
  const previous = unsubscribe
  unsubscribe = next
  state = s
  queueRender()
  await previous?.().catch(() => undefined)
}

async function main(): Promise<void> {
  const client = await connectExtension()
  installLongPress(client)
  new ResizeObserver(queueRender).observe(canvas)
  // Readings age out and the shift window slides even when nothing arrives.
  setInterval(queueRender, REDRAW_MS)
  await client.subscribe(['state.changed'], () => {
    apply(client).catch((err: unknown) => {
      console.warn('wind steering: settings reload failed', err)
    })
  })
  await followNightMode(client, (enabled) => {
    night = enabled
    queueRender()
  }).catch((err: unknown) => {
    console.warn('wind steering: night mode unavailable', err)
  })
  await apply(client)
}

main().catch((err: unknown) => {
  console.warn('wind steering: host connection failed', err)
})
