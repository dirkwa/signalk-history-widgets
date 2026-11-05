// The tank widget: one tank's level as a filled glass cylinder, coloured by
// the zone of its `meta.zones` the level is in (green, yellow, red), with the
// volume left when the tank publishes its capacity.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { installLongPress, followNightMode } from './host.js'
import { fetchMeta } from './signalk.js'
import {
  capacityPath,
  levelOf,
  parseTankConfig,
  parseZones,
  tankName,
  zoneMarks,
  zoneState,
  type TankConfig,
  type Zone
} from './tank-model.js'
import { TANK_DAY, TANK_NIGHT, drawTank, type TankFrame } from './tank-render.js'
import { convert, resolveDisplay, type Display } from './units.js'
import './styles.css'

// Tank senders report every few seconds; a level this old is no longer shown.
const STALE_MS = 120_000
const REDRAW_MS = 5000

interface Reading {
  time: number
  value: number
}

interface State {
  config: TankConfig
  title: string
  zones: Zone[]
  level: Display
  volume: Display
  levelReading?: Reading
  capacity?: Reading
}

const canvas = document.createElement('canvas')
document.getElementById('root')?.append(canvas)
let state: State | undefined
let night = false
let generation = 0
let unsubscribe: (() => Promise<void>) | undefined
let drawQueued = false

function fresh(r: Reading | undefined, now: number): number | undefined {
  return r && now - r.time < STALE_MS ? r.value : undefined
}

function frame(now: number): TankFrame {
  const palette = night ? TANK_NIGHT : TANK_DAY
  const s = state
  if (!s?.config.path) {
    return {
      title: 'Tank',
      fraction: undefined,
      level: 'ok',
      valueText: 'Not set up',
      volumeText: '',
      marks: [],
      palette
    }
  }
  const level = fresh(s.levelReading, now)
  const capacity = fresh(s.capacity, now)
  const volumeText =
    s.config.showVolume && level !== undefined && capacity !== undefined
      ? `${convert(level * capacity, s.volume.conversion).toFixed(s.volume.decimals)} ${s.volume.symbol}`.trim()
      : ''
  return {
    title: s.title,
    fraction: level,
    level: level === undefined ? 'ok' : levelOf(zoneState(level, s.zones)),
    valueText:
      level === undefined
        ? '--'
        : `${convert(level, s.level.conversion).toFixed(s.level.decimals)} ${s.level.symbol}`.trim(),
    volumeText,
    marks: zoneMarks(s.zones),
    palette
  }
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
  drawTank(ctx, rect.width, rect.height, frame(Date.now()))
}

function queueRender(): void {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(render)
}

async function apply(client: ExtensionClient): Promise<void> {
  const mine = ++generation
  const config = parseTankConfig(await client.state.get())
  const capPath = capacityPath(config.path)
  const [levelMeta, capMeta] = config.path
    ? await Promise.all([fetchMeta(config.path), fetchMeta(capPath)])
    : [undefined, undefined]
  if (mine !== generation) return
  const s: State = {
    config,
    title: config.label || levelMeta?.displayName || tankName(config.path),
    zones: parseZones(levelMeta?.zones),
    // Levels are ratios and capacities m³ in Signal K, metadata or not.
    level: resolveDisplay({ ...levelMeta, units: levelMeta?.units ?? 'ratio' }, undefined, 0),
    volume: resolveDisplay({ ...capMeta, units: capMeta?.units ?? 'm3' }, undefined, 0)
  }
  let next: (() => Promise<void>) | undefined
  if (config.path) {
    next = await client.signalk.subscribe([config.path, capPath], (ev) => {
      if (typeof ev.value !== 'number' || !Number.isFinite(ev.value)) return
      const reading = { time: Date.now(), value: ev.value }
      if (ev.path === config.path) s.levelReading = reading
      else s.capacity = reading
      queueRender()
    })
    if (mine !== generation) {
      await next().catch(() => undefined)
      return
    }
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
  // A level that stops arriving greys out even when nothing else happens.
  setInterval(queueRender, REDRAW_MS)
  await client.subscribe(['state.changed'], () => {
    apply(client).catch((err: unknown) => {
      console.warn('tank: settings reload failed', err)
    })
  })
  await followNightMode(client, (enabled) => {
    night = enabled
    queueRender()
  }).catch((err: unknown) => {
    console.warn('tank: night mode unavailable', err)
  })
  await apply(client)
}

main().catch((err: unknown) => {
  console.warn('tank: host connection failed', err)
})
