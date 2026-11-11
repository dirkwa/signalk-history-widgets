// The polar performance widget: how close the boat sails to its polar, as a
// percentage averaged over a few seconds, coloured by its zone.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { installLongPress, followNightMode } from './host.js'
import { followScreenScheme, paletteFor, screenIsLight } from './theme.js'
import { fetchMeta } from './signalk.js'
import { SourceClock } from './steer-model.js'
import type { Zone } from './level-model.js'
import { LEVEL_DAY, LEVEL_LIGHT, LEVEL_NIGHT } from './level-render.js'
import {
  POLAR_DEFAULTS,
  RatioAverage,
  SOURCES,
  parsePolarConfig,
  ratioLevel,
  settingsLoader,
  zonesFor,
  type PolarConfig
} from './polar-model.js'
import { drawPolar, type PolarFrame } from './polar-render.js'
import { convert, resolveDisplay, type Display } from './units.js'
import './styles.css'

// The plugin reports on every wind update; a silent one greys out.
const STALE_MS = 30_000
const REDRAW_MS = 1000
const RETRY_MS = 5000

const canvas = document.createElement('canvas')
document.getElementById('root')?.append(canvas)
let config: PolarConfig = POLAR_DEFAULTS
let night = false
let zones: Zone[] = zonesFor(undefined)
let speedDisplay: Display = resolveDisplay({ units: 'm/s' }, undefined, 1)
let average = new RatioAverage()
let target: { time: number; value: number } | undefined
let drawQueued = false
let unsubscribe: (() => Promise<void>) | undefined
let generation = 0

function detailText(ratio: number | undefined, now: number): string {
  if (average.noTarget) return 'No target'
  if (!config.showDetail || ratio === undefined) return ''
  if (!target || now - target.time >= STALE_MS) return ''
  const show = (v: number) => convert(v, speedDisplay.conversion).toFixed(speedDisplay.decimals)
  return `${show(ratio * target.value)} / ${show(target.value)} ${speedDisplay.symbol}`
}

function frame(now: number): PolarFrame {
  const ratio = average.mean(now, config.averageSeconds * 1000, STALE_MS)
  return {
    title: config.label || SOURCES[config.source].title,
    ratio,
    text: ratio === undefined ? '--' : `${Math.round(ratio * 100)} %`,
    detail: detailText(ratio, now),
    level: ratio === undefined ? 'ok' : ratioLevel(ratio, zones),
    palette: paletteFor(
      { dark: LEVEL_DAY, light: LEVEL_LIGHT, night: LEVEL_NIGHT },
      config.theme,
      night,
      screenIsLight()
    )
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
  drawPolar(ctx, rect.width, rect.height, frame(Date.now()))
}

function queueRender(): void {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(render)
}

async function loadMeta(mine: number): Promise<void> {
  const spec = SOURCES[config.source]
  const [ratioMeta, targetMeta] = await Promise.all([
    fetchMeta(spec.ratioPath),
    fetchMeta(spec.targetPath)
  ])
  if (mine !== generation) return
  zones = zonesFor(ratioMeta?.zones)
  speedDisplay = resolveDisplay({ ...targetMeta, units: 'm/s' }, undefined, 1)
  queueRender()
}

async function follow(client: ExtensionClient): Promise<void> {
  const mine = ++generation
  const spec = SOURCES[config.source]
  const clock = new SourceClock()
  average = new RatioAverage()
  target = undefined
  // The new source's metadata may take a while, or never come.
  zones = zonesFor(undefined)
  speedDisplay = resolveDisplay({ units: 'm/s' }, undefined, 1)
  const next = await client.signalk.subscribe([spec.ratioPath, spec.targetPath], (ev) => {
    // The previous source may still deliver until its unsubscribe lands.
    if (mine !== generation) return
    const time = clock.local(Date.now(), ev.timestamp)
    const value = typeof ev.value === 'number' && Number.isFinite(ev.value) ? ev.value : null
    if (ev.path === spec.ratioPath) average.add(time, value)
    else target = value === null ? undefined : { time, value }
    queueRender()
  })
  if (mine !== generation) {
    await next().catch(() => undefined)
    return
  }
  const previous = unsubscribe
  unsubscribe = next
  queueRender()
  void loadMeta(mine)
  void previous?.().catch(() => undefined)
}

async function main(client: ExtensionClient): Promise<void> {
  installLongPress(client)
  new ResizeObserver(queueRender).observe(canvas)
  // Keeps the average moving, and greys out a plugin that stopped.
  setInterval(queueRender, REDRAW_MS)
  // One pending retry at most, however often reloads fail meanwhile.
  let retry: ReturnType<typeof setTimeout> | undefined
  const loadSettings = settingsLoader(
    async () => {
      config = parsePolarConfig(await client.state.get())
      queueRender()
      return config
    },
    () => follow(client),
    (err, reload) => {
      console.warn('polar: settings or subscription unavailable', err)
      clearTimeout(retry)
      retry = setTimeout(() => void reload(), RETRY_MS)
    }
  )
  const watchSettings = async (): Promise<void> => {
    try {
      await client.subscribe(['state.changed'], () => {
        void loadSettings()
      })
    } catch (err: unknown) {
      console.warn('polar: settings changes unavailable', err)
      // A reload once it is back picks up changes made meanwhile.
      setTimeout(() => void watchSettings().then(loadSettings), RETRY_MS)
    }
  }
  await watchSettings()
  await followNightMode(client, (enabled) => {
    night = enabled
    queueRender()
  }).catch((err: unknown) => {
    console.warn('polar: night mode unavailable', err)
  })
  followScreenScheme(queueRender)
  await loadSettings()
}

connectExtension()
  .then(main)
  .catch((err: unknown) => {
    console.warn('polar: host connection failed', err)
  })
