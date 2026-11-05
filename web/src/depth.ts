// The depth profile widget: the depth over the last minutes or hours with
// time running left to right, seeded from the History API like the strip.
// Settings come from the instance state the configuration panel writes.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { DEPTH_PATHS, depthPath, depthTitle, parseDepthConfig } from './depth-model.js'
import { DEPTH_DAY, DEPTH_NIGHT, drawDepth, type DepthFrame } from './depth-render.js'
import { fetchHistory } from './history.js'
import { followNightMode, installLongPress } from './host.js'
import { Series } from './series.js'
import { fetchMeta, fetchValue } from './signalk.js'
import { convert, resolveDisplay, type Display } from './units.js'
import './styles.css'

// A reading older than this shows as missing rather than as the current depth.
const STALE_MS = 60_000

interface Profile {
  path: string
  display: Display
  series: Series
  last?: { time: number; value: number }
  loading: boolean
}

const canvas = document.createElement('canvas')
document.getElementById('root')?.append(canvas)
let profile: Profile | undefined
let night = false
let generation = 0
let unsubscribe: (() => Promise<void>) | undefined
let timer: ReturnType<typeof setInterval> | undefined
let drawQueued = false

function frame(now: number): DepthFrame {
  const palette = night ? DEPTH_NIGHT : DEPTH_DAY
  const s = profile
  if (!s) {
    return { title: 'Depth', value: '--', symbol: '', windowMs: 1, bands: [], message: '', palette }
  }
  const c = s.display.conversion
  const bands = (s.series.stats(now)?.bands ?? []).map((b) => ({
    ...b,
    lo: convert(b.lo, c),
    hi: convert(b.hi, c)
  }))
  const fresh = s.last && now - s.last.time < STALE_MS ? s.last.value : undefined
  return {
    title: depthTitle(s.path),
    value: fresh === undefined ? '--' : convert(fresh, c).toFixed(s.display.decimals),
    symbol: s.display.symbol,
    windowMs: s.series.windowMs,
    bands,
    message: s.loading ? 'Loading…' : 'No depth yet',
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
  drawDepth(ctx, rect.width, rect.height, frame(Date.now()))
}

function queueRender(): void {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(render)
}

async function seed(s: Profile, mine: number): Promise<void> {
  const rows = await fetchHistory(s.path, s.series.windowMs, s.series.bucketMs)
  if (mine !== generation) return
  if (rows.length > 0) {
    s.series.clear()
    for (const r of rows) s.series.merge(r.time, r.min, r.max, r.avg)
    if (s.last) s.series.add(s.last.time, s.last.value)
  }
  s.loading = false
  queueRender()
}

/** The depths the server has a value for now. */
async function availableDepths(): Promise<Set<string>> {
  const values = await Promise.all(DEPTH_PATHS.map((d) => fetchValue(d.path)))
  return new Set(DEPTH_PATHS.filter((_, i) => typeof values[i] === 'number').map((d) => d.path))
}

async function apply(client: ExtensionClient): Promise<void> {
  const mine = ++generation
  if (unsubscribe) {
    const u = unsubscribe
    unsubscribe = undefined
    await u().catch(() => undefined)
  }
  if (timer) clearInterval(timer)
  const config = parseDepthConfig(await client.state.get())
  const path = depthPath(config, config.path ? new Set() : await availableDepths())
  const meta = await fetchMeta(path)
  if (mine !== generation) return
  const s: Profile = {
    path,
    display: resolveDisplay({ ...meta, units: meta?.units ?? 'm' }, undefined, -1),
    series: new Series(config.minutes * 60_000, false),
    loading: true
  }
  profile = s
  queueRender()
  unsubscribe = await client.signalk.subscribe([path], (ev) => {
    if (typeof ev.value !== 'number' || !Number.isFinite(ev.value)) return
    const now = Date.now()
    s.last = { time: now, value: ev.value }
    s.series.add(now, ev.value)
    queueRender()
  })
  // The profile scrolls even when the depth does not change.
  timer = setInterval(queueRender, Math.max(1000, s.series.bucketMs))
  await seed(s, mine)
}

async function main(): Promise<void> {
  const client = await connectExtension()
  installLongPress(client)
  new ResizeObserver(queueRender).observe(canvas)
  await client.subscribe(['state.changed'], () => {
    apply(client).catch((err: unknown) => {
      console.warn('depth profile: settings reload failed', err)
    })
  })
  // History fills the gaps left while the page was hidden and saw no deltas.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && profile) {
      void seed(profile, generation)
    }
  })
  await followNightMode(client, (enabled) => {
    night = enabled
    queueRender()
  }).catch((err: unknown) => {
    console.warn('depth profile: night mode unavailable', err)
  })
  await apply(client)
}

main().catch((err: unknown) => {
  console.warn('depth profile: host connection failed', err)
})
