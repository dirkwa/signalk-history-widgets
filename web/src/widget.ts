// The history strip widget: follows one Signal K path, seeds the window from
// the History API and draws it. Settings come from the instance state the
// configuration panel writes, and a change there rebuilds the strip.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { isSignedAngle, labelFor, parseConfig, windowMs, type StripConfig } from './config-model.js'
import { fetchHistory, fetchHistoryWhenReady } from './history.js'
import { followNightMode, installLongPress } from './host.js'
import { DAY, NIGHT, draw, type Frame } from './render.js'
import { Series, wrapAngle } from './series.js'
import { fetchMeta } from './signalk.js'
import { convert, resolveDisplay, type Display } from './units.js'
import './styles.css'

// A reading older than this shows as missing rather than as the current value.
const STALE_MS = 60_000
const TWO_PI = 2 * Math.PI
const MIN_SPAN_DISPLAY_UNITS = 2

interface Strip {
  config: StripConfig
  display: Display
  series: Series
  signed: boolean
  last?: { time: number; value: number }
  loading: boolean
}

const canvas = document.createElement('canvas')
document.getElementById('root')?.append(canvas)
let strip: Strip | undefined
let night = false
let generation = 0
let unsubscribe: (() => Promise<void>) | undefined
let timer: ReturnType<typeof setInterval> | undefined
let drawQueued = false

function text(si: number | undefined, s: Strip): string {
  if (si === undefined || !Number.isFinite(si)) return '--'
  let v = si
  if (s.display.angular) v = s.signed ? wrapAngle(si) : ((si % TWO_PI) + TWO_PI) % TWO_PI
  const shown = convert(v, s.display.conversion)
  // 359.6 rounds to 360, which a compass reads as 0.
  const out = shown.toFixed(s.display.decimals)
  return s.display.angular && !s.signed && Number(out) >= 360
    ? (0).toFixed(s.display.decimals)
    : out
}

function frame(now: number): Frame {
  const palette = night ? NIGHT : DAY
  const s = strip
  if (!s) {
    return {
      label: '',
      value: '--',
      symbol: '',
      min: '',
      avg: '',
      max: '',
      windowMs: 1,
      stats: undefined,
      minSpan: 1,
      palette
    }
  }
  const stats = s.series.stats(now)
  const at = (offset: number | undefined) =>
    offset === undefined ? undefined : (stats?.centre ?? 0) + offset
  const fresh = s.last && now - s.last.time < STALE_MS ? s.last.value : undefined
  const unitSpan = s.display.conversion ? 1 / Math.abs(s.display.conversion.factor) : 1
  return {
    label: labelFor(s.config),
    value: text(fresh, s),
    symbol: s.display.symbol,
    min: stats ? text(at(stats.min), s) : '',
    avg: stats ? text(at(stats.avg), s) : '',
    max: stats ? text(at(stats.max), s) : '',
    windowMs: s.series.windowMs,
    stats,
    // A steady value still draws inside a range, not stretched edge to edge.
    minSpan: MIN_SPAN_DISPLAY_UNITS * unitSpan,
    message: s.loading ? 'Loading…' : 'No data',
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
  draw(ctx, rect.width, rect.height, frame(Date.now()))
}

function queueRender(): void {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(render)
}

async function seed(s: Strip, mine: number, retry: boolean): Promise<void> {
  // "Loading…" covers the first answer only; while the provider is awaited
  // the widget shows its live readings or that it has none.
  const query = async () => {
    const rows = await fetchHistory(s.config.path, s.series.windowMs, s.series.bucketMs)
    s.loading = false
    return rows
  }
  const rows = retry
    ? await fetchHistoryWhenReady(query, () => mine === generation)
    : ((await query()) ?? [])
  if (mine !== generation) return
  // Merged into what the stream delivered meanwhile, so no live reading and
  // none of its extremes are lost.
  for (const r of rows) s.series.merge(r.time, r.min, r.max, r.avg)
  queueRender()
}

async function apply(client: ExtensionClient): Promise<void> {
  const mine = ++generation
  if (unsubscribe) {
    const u = unsubscribe
    unsubscribe = undefined
    await u().catch(() => undefined)
  }
  if (timer) clearInterval(timer)
  const config = parseConfig(await client.state.get())
  const meta = await fetchMeta(config.path)
  if (mine !== generation) return
  const display = resolveDisplay(meta, config.unit || undefined, config.decimals)
  const span = windowMs(config)
  const s: Strip = {
    config,
    display,
    series: new Series(span, display.angular),
    signed: isSignedAngle(config.path),
    loading: true
  }
  strip = s
  queueRender()
  unsubscribe = await client.signalk.subscribe([config.path], (ev) => {
    if (typeof ev.value !== 'number' || !Number.isFinite(ev.value)) return
    const now = Date.now()
    s.last = { time: now, value: ev.value }
    s.series.add(now, ev.value)
    queueRender()
  })
  // The strip scrolls even when the value does not change.
  timer = setInterval(queueRender, Math.max(1000, s.series.bucketMs))
  await seed(s, mine, true)
}

async function main(): Promise<void> {
  const client = await connectExtension()
  installLongPress(client)
  new ResizeObserver(queueRender).observe(canvas)
  await client.subscribe(['state.changed'], () => {
    apply(client).catch((err: unknown) => {
      console.warn('history strip: settings reload failed', err)
    })
  })
  // History fills the gaps left while the page was hidden and saw no deltas.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && strip) {
      void seed(strip, generation, false)
    }
  })
  await followNightMode(client, (enabled) => {
    night = enabled
    queueRender()
  }).catch((err: unknown) => {
    console.warn('history strip: night mode unavailable', err)
  })
  await apply(client)
}

main().catch((err: unknown) => {
  console.warn('history strip: host connection failed', err)
})
