// The depth profile widget: the depth over the last minutes or hours with
// time running left to right, seeded from the History API like the strip.
// Settings come from the instance state the configuration panel writes.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { DEPTH_PATHS, depthPath, depthTitle, parseDepthConfig } from './depth-model.js'
import { DEPTH_DAY, DEPTH_LIGHT, DEPTH_NIGHT, drawDepth, type DepthFrame } from './depth-render.js'
import { REQUEST_TIMEOUT_MS, fetchHistory, fetchHistoryWhenReady } from './history.js'
import { followNightMode, followPanelOpacity, installLongPress, onResume } from './host.js'
import {
  type Theme,
  followScreenScheme,
  paletteFor,
  screenIsLight,
  withPanelOpacity
} from './theme.js'
import { Series } from './series.js'
import { fetchMeta, readValue } from './signalk.js'
import { convert, resolveDisplay, type Display } from './units.js'
import './styles.css'

// A reading older than this shows as missing rather than as the current depth.
const STALE_MS = 60_000
// How long to wait before trying again after the settings or the depth
// lookup failed; the profile already shown keeps running meanwhile.
const RETRY_MS = 10_000

interface Profile {
  path: string
  display: Display
  series: Series
  last?: { time: number; value: number }
  loading: boolean
  theme: Theme
}

const canvas = document.createElement('canvas')
document.getElementById('root')?.append(canvas)
let profile: Profile | undefined
let night = false
let panelOpacity: number | null = null
let generation = 0
let unsubscribe: (() => Promise<void>) | undefined
let timer: ReturnType<typeof setInterval> | undefined
let drawQueued = false

function frame(now: number): DepthFrame {
  const palette = withPanelOpacity(
    paletteFor(
      { dark: DEPTH_DAY, light: DEPTH_LIGHT, night: DEPTH_NIGHT },
      profile?.theme ?? 'dark',
      night,
      screenIsLight()
    ),
    panelOpacity
  )
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

async function seed(s: Profile, retry: boolean): Promise<void> {
  // "Loading…" covers the first answer only; while the provider is awaited
  // the widget shows its live readings or that it has none.
  const query = async (timeoutMs: number) => {
    const rows = await fetchHistory(s.path, s.series.windowMs, s.series.bucketMs, timeoutMs)
    s.loading = false
    return rows
  }
  const rows = retry
    ? await fetchHistoryWhenReady(query, () => profile === s)
    : ((await query(REQUEST_TIMEOUT_MS)) ?? [])
  if (profile !== s) return
  // Merged into what the stream delivered meanwhile, so no live reading and
  // none of its extremes are lost.
  for (const r of rows) s.series.merge(r.time, r.min, r.max, r.avg)
  queueRender()
}

/**
 * The depths the server has a value for now. Rejects when a lookup fails, so
 * a passing server error never demotes the choice to a less preferred depth.
 */
async function availableDepths(): Promise<Set<string>> {
  const values = await Promise.all(DEPTH_PATHS.map((d) => readValue(d.path)))
  return new Set(DEPTH_PATHS.filter((_, i) => typeof values[i] === 'number').map((d) => d.path))
}

async function apply(client: ExtensionClient): Promise<void> {
  const mine = ++generation
  // The current profile keeps running until its replacement is subscribed,
  // so a settings read that fails leaves the widget live, not frozen.
  const config = parseDepthConfig(await client.state.get())
  const path = depthPath(config, config.path ? new Set() : await availableDepths())
  const meta = await fetchMeta(path)
  if (mine !== generation) return
  const s: Profile = {
    path,
    display: resolveDisplay({ ...meta, units: meta?.units ?? 'm' }, undefined, -1),
    series: new Series(config.minutes * 60_000, false),
    loading: true,
    theme: config.theme
  }
  const next = await client.signalk.subscribe([path], (ev) => {
    if (typeof ev.value !== 'number' || !Number.isFinite(ev.value)) return
    const now = Date.now()
    s.last = { time: now, value: ev.value }
    s.series.add(now, ev.value)
    queueRender()
  })
  // A newer apply() started while this one subscribed: it owns the widget now.
  if (mine !== generation) {
    await next().catch(() => undefined)
    return
  }
  // Swapped without an await in between, so no other apply() can interleave.
  const previous = unsubscribe
  clearInterval(timer)
  unsubscribe = next
  profile = s
  queueRender()
  // The profile scrolls even when the depth does not change.
  timer = setInterval(queueRender, Math.max(1000, s.series.bucketMs))
  const seeding = seed(s, true)
  void previous?.().catch(() => undefined)
  await seeding
}

function load(client: ExtensionClient): void {
  apply(client).catch((err: unknown) => {
    console.warn('depth profile: loading settings failed, retrying', err)
    const failed = generation
    setTimeout(() => {
      if (generation === failed) load(client)
    }, RETRY_MS)
  })
}

async function main(): Promise<void> {
  const client = await connectExtension()
  installLongPress(client)
  new ResizeObserver(queueRender).observe(canvas)
  await client.subscribe(['state.changed'], () => {
    load(client)
  })
  // History fills the gaps left while the page was hidden or stopped and saw
  // no deltas. Asked until it answers, as a browser coming back from a stop
  // sends every widget's query at once.
  onResume(async () => {
    if (profile) await seed(profile, true)
  })
  await followNightMode(client, (enabled) => {
    night = enabled
    queueRender()
  }).catch((err: unknown) => {
    console.warn('depth profile: night mode unavailable', err)
  })
  await followPanelOpacity(client, (opacity) => {
    panelOpacity = opacity
    queueRender()
  }).catch((err: unknown) => {
    console.warn('depth profile: panel opacity unavailable', err)
  })
  followScreenScheme(queueRender)
  load(client)
}

main().catch((err: unknown) => {
  console.warn('depth profile: host connection failed', err)
})
