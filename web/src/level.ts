// A fill-level widget: one tank's level or one battery bank's state of charge
// as a 3D cylinder or a flat bar, coloured by the zone of its `meta.zones`
// the level is in (green, yellow, red), with the tank's volume left or the
// bank's voltage underneath. The page's entry module picks the kind.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { installLongPress, followNightMode } from './host.js'
import { fetchMeta } from './signalk.js'
import {
  KINDS,
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
  levelReading?: Reading
  detailReading?: Reading
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
    return {
      title: s.title,
      fraction: level,
      level: level === undefined ? 'ok' : levelOf(zoneState(level, s.zones)),
      valueText:
        level === undefined
          ? '--'
          : `${convert(level, s.level.conversion).toFixed(s.level.decimals)} ${s.level.symbol}`.trim(),
      detailText,
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
    const detailPath = spec.detailPath(config.path)
    const [levelMeta, detailMeta] = config.path
      ? await Promise.all([fetchMeta(config.path), fetchMeta(detailPath)])
      : [undefined, undefined]
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
      )
    }
    let next: (() => Promise<void>) | undefined
    if (config.path) {
      next = await client.signalk.subscribe([config.path, detailPath], (ev) => {
        if (typeof ev.value !== 'number' || !Number.isFinite(ev.value)) return
        const reading = { time: Date.now(), value: ev.value }
        if (ev.path === config.path) s.levelReading = reading
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
