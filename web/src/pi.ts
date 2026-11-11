// The system health widget: CPU temperature, CPU load and memory (and storage
// if chosen) of the computer Signal K runs on, as signalk-rpi-stats reports
// them, each in the colour of its zone.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { installLongPress, followNightMode } from './host.js'
import { followScreenScheme, paletteFor, screenIsLight } from './theme.js'
import { fetchMeta } from './signalk.js'
import { SourceClock } from './steer-model.js'
import type { Zone } from './level-model.js'
import { LEVEL_DAY, LEVEL_LIGHT, LEVEL_NIGHT } from './level-render.js'
import {
  BAR_LABELS,
  METRIC_PATHS,
  THROTTLE_PATHS,
  barMetrics,
  metricLevel,
  parsePiConfig,
  throttleWarning,
  zonesFor,
  type Metric,
  type PiConfig
} from './pi-model.js'
import { drawPi, type PiBar, type PiFrame } from './pi-render.js'
import { convert, resolveDisplay, type Display } from './units.js'
import './styles.css'

// signalk-rpi-stats reports every ten seconds by default.
const STALE_MS = 120_000
const REDRAW_MS = 5000
const METRICS = Object.keys(METRIC_PATHS) as Metric[]
const PERCENT = resolveDisplay({ units: 'ratio' }, 'percent', 0)

interface Reading {
  time: number
  value: number
}

const canvas = document.createElement('canvas')
document.getElementById('root')?.append(canvas)
let config: PiConfig = parsePiConfig({})
let night = false
let temperatureDisplay: Display = resolveDisplay({ units: 'K' }, undefined, 0)
const zones = Object.fromEntries(METRICS.map((m) => [m, zonesFor(m, undefined)])) as Record<
  Metric,
  Zone[]
>
const readings = new Map<string, Reading>()
const flags = new Map<string, { time: number; on: boolean }>()
let drawQueued = false

function fresh(path: string, now: number): number | undefined {
  const r = readings.get(path)
  return r && now - r.time < STALE_MS ? r.value : undefined
}

function frame(now: number): PiFrame {
  const temperature = fresh(METRIC_PATHS.temperature, now)
  const bars: PiBar[] = barMetrics(config).map((metric) => {
    const value = fresh(METRIC_PATHS[metric], now)
    return {
      label: BAR_LABELS[metric],
      fraction: value,
      text:
        value === undefined
          ? '--'
          : `${convert(value, PERCENT.conversion).toFixed(PERCENT.decimals)} ${PERCENT.symbol}`,
      level: value === undefined ? 'ok' : metricLevel(value, zones[metric])
    }
  })
  const flag = (path: string) => {
    const f = flags.get(path)
    return f !== undefined && now - f.time < STALE_MS && f.on
  }
  return {
    title: config.label || 'System',
    warning: throttleWarning({
      underVoltage: flag(THROTTLE_PATHS.underVoltage),
      throttled: flag(THROTTLE_PATHS.throttled)
    }),
    temperature: {
      text:
        temperature === undefined
          ? '--'
          : `${convert(temperature, temperatureDisplay.conversion).toFixed(temperatureDisplay.decimals)}${temperatureDisplay.symbol}`,
      level: temperature === undefined ? 'ok' : metricLevel(temperature, zones.temperature),
      known: temperature !== undefined
    },
    bars,
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
  drawPi(ctx, rect.width, rect.height, frame(Date.now()))
}

function queueRender(): void {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(render)
}

async function loadMeta(): Promise<void> {
  const metas = await Promise.all(METRICS.map((m) => fetchMeta(METRIC_PATHS[m])))
  for (const [i, metric] of METRICS.entries()) zones[metric] = zonesFor(metric, metas[i]?.zones)
  const temperatureMeta = metas[METRICS.indexOf('temperature')]
  temperatureDisplay = resolveDisplay({ ...temperatureMeta, units: 'K' }, undefined, 0)
  queueRender()
}

async function main(client: ExtensionClient): Promise<void> {
  installLongPress(client)
  new ResizeObserver(queueRender).observe(canvas)
  // A computer that stops reporting greys out even when nothing else happens.
  setInterval(queueRender, REDRAW_MS)
  const loadSettings = () =>
    client.state
      .get()
      .then((stored) => {
        config = parsePiConfig(stored)
        queueRender()
      })
      .catch((err: unknown) => {
        console.warn('system: settings unavailable', err)
      })
  await client.subscribe(['state.changed'], () => {
    void loadSettings()
  })
  await followNightMode(client, (enabled) => {
    night = enabled
    queueRender()
  }).catch((err: unknown) => {
    console.warn('system: night mode unavailable', err)
  })
  followScreenScheme(queueRender)
  await loadSettings()
  void loadMeta()
  const clock = new SourceClock()
  const throttle: string[] = Object.values(THROTTLE_PATHS)
  await client.signalk.subscribe([...Object.values(METRIC_PATHS), ...throttle], (ev) => {
    // A cached reading keeps its real age, so an old one still greys out.
    const time = clock.local(Date.now(), ev.timestamp)
    if (throttle.includes(ev.path)) {
      if (typeof ev.value === 'boolean') flags.set(ev.path, { time, on: ev.value })
    } else if (typeof ev.value === 'number' && Number.isFinite(ev.value)) {
      readings.set(ev.path, { time, value: ev.value })
    } else {
      readings.delete(ev.path)
    }
    queueRender()
  })
}

connectExtension()
  .then(main)
  .catch((err: unknown) => {
    console.warn('system: host connection failed', err)
  })
