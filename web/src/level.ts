// A fill-level widget: one tank's level or one battery bank's state of charge
// as a 3D cylinder or a flat bar, coloured by the zone of its `meta.zones`
// the level is in (green, yellow, red), with the tank's volume left or the
// bank's voltage and current underneath. The page's entry module picks the kind.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { installLongPress, followNightMode } from './host.js'
import { fetchMeta, fetchValue } from './signalk.js'
import { SourceClock } from './steer-model.js'
import {
  KINDS,
  flowOf,
  levelOf,
  parseLevelConfig,
  parseZones,
  zoneMarks,
  zoneState,
  type LevelConfig,
  type LevelKind,
  type Zone
} from './level-model.js'
import { LEVEL_DAY, LEVEL_NIGHT, drawLevel, type LevelFrame } from './level-render.js'
import { convert, resolveDisplay, type Display } from './units.js'
import './styles.css'

// Senders report every few seconds; a reading this old is no longer shown.
const STALE_MS = 120_000
const REDRAW_MS = 5000

interface Reading {
  time: number
  value: number
}

interface State {
  config: LevelConfig
  title: string
  zones: Zone[]
  level: Display
  detail: Display
  flow: Display
  levelReading?: Reading
  detailReading?: Reading
  flowReading?: Reading
}

export function startLevel(kind: LevelKind): void {
  const spec = KINDS[kind]
  const canvas = document.createElement('canvas')
  document.getElementById('root')?.append(canvas)
  let state: State | undefined
  let night = false
  let generation = 0
  let unsubscribe: (() => Promise<void>) | undefined
  let drawQueued = false

  const fresh = (r: Reading | undefined, now: number, ages = true): number | undefined =>
    r && (!ages || now - r.time < STALE_MS) ? r.value : undefined

  function frame(now: number): LevelFrame {
    const palette = night ? LEVEL_NIGHT : LEVEL_DAY
    const s = state
    if (!s?.config.path) {
      return {
        title: spec.noun,
        fraction: undefined,
        level: 'ok',
        valueText: 'Not set up',
        detailText: '',
        marks: [],
        kind,
        style: s?.config.style ?? '3d',
        palette
      }
    }
    const level = fresh(s.levelReading, now)
    const detail = fresh(s.detailReading, now, spec.detailAges)
    const detailText =
      s.config.showDetail && level !== undefined && detail !== undefined
        ? `${convert(spec.detail(level, detail), s.detail.conversion).toFixed(s.detail.decimals)} ${s.detail.symbol}`.trim()
        : ''
    const amps = s.config.showDetail ? fresh(s.flowReading, now) : undefined
    const flow =
      amps === undefined
        ? undefined
        : {
            text: `${convert(Math.abs(amps), s.flow.conversion).toFixed(s.flow.decimals)} ${s.flow.symbol}`.trim(),
            direction: flowOf(amps)
          }
    return {
      title: s.title,
      fraction: level,
      level: level === undefined ? 'ok' : levelOf(zoneState(level, s.zones)),
      valueText:
        level === undefined
          ? '--'
          : `${convert(level, s.level.conversion).toFixed(s.level.decimals)} ${s.level.symbol}`.trim(),
      detailText,
      flow,
      marks: zoneMarks(s.zones),
      kind,
      style: s.config.style,
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
    drawLevel(ctx, rect.width, rect.height, frame(Date.now()))
  }

  function queueRender(): void {
    if (drawQueued) return
    drawQueued = true
    requestAnimationFrame(render)
  }

  async function apply(client: ExtensionClient): Promise<void> {
    const mine = ++generation
    const config = parseLevelConfig(await client.state.get())
    // Only a tank or bank of this kind has a capacity or voltage beside it;
    // another 0 to 100 % value shows its level alone.
    const ofKind = spec.matches(config.path)
    const detailPath = ofKind ? spec.detailPath(config.path) : undefined
    const flowPath = ofKind ? spec.flowPath?.(config.path) : undefined
    // A tank's capacity is sent rarely, often only at boot, so a widget opened
    // later reads it once; a reading that ages (a bank's voltage) waits for
    // the stream instead of showing an old value as current.
    const [levelMeta, detailMeta, detailNow, flowMeta] = config.path
      ? await Promise.all([
          fetchMeta(config.path),
          detailPath ? fetchMeta(detailPath) : undefined,
          detailPath && !spec.detailAges ? fetchValue(detailPath) : undefined,
          flowPath ? fetchMeta(flowPath) : undefined
        ])
      : [undefined, undefined, undefined, undefined]
    if (mine !== generation) return
    const s: State = {
      config,
      title: config.label || levelMeta?.displayName || spec.name(config.path),
      zones: parseZones(levelMeta?.zones),
      // Levels are ratios in Signal K, metadata or not, and always read as a
      // percentage, even where the server prefers plain ratios.
      level: resolveDisplay({ ...levelMeta, units: levelMeta?.units ?? 'ratio' }, 'percent', 0),
      detail: resolveDisplay(
        { ...detailMeta, units: detailMeta?.units ?? spec.detailUnits },
        undefined,
        spec.detailDecimals
      ),
      flow: resolveDisplay({ ...flowMeta, units: flowMeta?.units ?? 'A' }, undefined, 1)
    }
    if (typeof detailNow === 'number' && Number.isFinite(detailNow)) {
      s.detailReading = { time: Date.now(), value: detailNow }
    }
    let next: (() => Promise<void>) | undefined
    if (config.path) {
      const paths = [config.path, detailPath, flowPath].filter((p) => p !== undefined)
      const clock = new SourceClock()
      next = await client.signalk.subscribe(paths, (ev) => {
        if (typeof ev.value !== 'number' || !Number.isFinite(ev.value)) return
        // A cached reading keeps its real age, so an old level still greys out.
        const reading = { time: clock.local(Date.now(), ev.timestamp), value: ev.value }
        if (ev.path === config.path) s.levelReading = reading
        else if (ev.path === flowPath) s.flowReading = reading
        else s.detailReading = reading
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
        console.warn(`${kind}: settings reload failed`, err)
      })
    })
    await followNightMode(client, (enabled) => {
      night = enabled
      queueRender()
    }).catch((err: unknown) => {
      console.warn(`${kind}: night mode unavailable`, err)
    })
    await apply(client)
  }

  main().catch((err: unknown) => {
    console.warn(`${kind}: host connection failed`, err)
  })
}
