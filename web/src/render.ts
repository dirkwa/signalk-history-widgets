// Draws the strip: a header with the live value, the window's minimum,
// average and maximum, and below it one bar per time bucket, newest at the
// top. The value axis spans the window's own minimum to maximum, so the
// trace always fills the strip however little the value moves. A reference
// value, such as 100 % of the polar, widens the axis to stay in view.

import type { WindowStats } from './series.js'

export interface Palette {
  card: string
  text: string
  muted: string
  bar: string
  avg: string
  grid: string
  reference: string
}

export const DAY: Palette = {
  card: 'rgba(20, 26, 32, 0.78)',
  text: '#e8edf2',
  muted: '#9fb3c4',
  bar: '#29b6f6',
  avg: '#ef5350',
  grid: 'rgba(255, 255, 255, 0.22)',
  reference: 'rgba(232, 237, 242, 0.85)'
}

export const LIGHT: Palette = {
  card: 'rgba(246, 248, 250, 0.9)',
  text: '#1d2329',
  muted: '#546e7a',
  bar: '#0288d1',
  avg: '#d32f2f',
  grid: 'rgba(0, 0, 0, 0.18)',
  reference: 'rgba(29, 35, 41, 0.8)'
}

export const NIGHT: Palette = {
  card: 'rgba(8, 0, 0, 0.85)',
  text: '#d32f2f',
  muted: '#8e2424',
  bar: '#7f1212',
  avg: '#ff5252',
  grid: 'rgba(211, 47, 47, 0.3)',
  reference: '#d32f2f'
}

export interface Tick {
  age: number
  label: string
}

const TICK_STEPS_MIN = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 720, 1440]
const MAX_TICK_INTERVALS = 4

/** Time marks down the strip, e.g. 10, 20, 30 for a 30 minute window. */
export function timeTicks(windowMs: number): Tick[] {
  const minutes = windowMs / 60_000
  const step =
    TICK_STEPS_MIN.find((s) => minutes / s <= MAX_TICK_INTERVALS) ??
    Math.ceil(minutes / MAX_TICK_INTERVALS / 1440) * 1440
  const inHours = minutes > 120
  const ticks: Tick[] = []
  for (let m = step; m <= minutes + 1e-9; m += step) {
    ticks.push({
      age: m * 60_000,
      label: inHours ? `${+(m / 60).toFixed(1)}h` : `${m}`
    })
  }
  return ticks
}

/** The value axis: the window's range and the reference with a margin, never empty. */
export function valueAxis(
  stats: WindowStats,
  minSpan: number,
  reference?: number
): { lo: number; hi: number } {
  let lo = Math.min(stats.min, reference ?? stats.min)
  let hi = Math.max(stats.max, reference ?? stats.max)
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  const pad = (hi - lo) * 0.05
  return { lo: lo - pad, hi: hi + pad }
}

export interface Frame {
  label: string
  value: string
  symbol: string
  min: string
  avg: string
  max: string
  windowMs: number
  stats: WindowStats | undefined
  /** Smallest value range the axis shows, in plot units. */
  minSpan: number
  /** Value marked with a dashed line, in plot units. */
  reference?: number
  message?: string
  palette: Palette
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  weight = ''
): number {
  let px = size
  ctx.font = `${weight} ${px}px 'Helvetica Neue', Arial, sans-serif`
  while (px > 7 && ctx.measureText(text).width > maxWidth) {
    px--
    ctx.font = `${weight} ${px}px 'Helvetica Neue', Arial, sans-serif`
  }
  return px
}

export function draw(ctx: CanvasRenderingContext2D, width: number, height: number, f: Frame): void {
  const p = f.palette
  const pad = Math.max(4, Math.round(width * 0.05))
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = p.card
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, 10)
  ctx.fill()

  ctx.textBaseline = 'alphabetic'
  const inner = width - 2 * pad

  // Header: label and unit, then the live value.
  const small = Math.max(8, Math.round(Math.min(width / 9, height / 18)))
  ctx.fillStyle = p.muted
  ctx.font = `600 ${small}px 'Helvetica Neue', Arial, sans-serif`
  ctx.textAlign = 'left'
  let y = pad + small
  ctx.fillText(f.label, pad, y, inner * 0.7)
  ctx.textAlign = 'right'
  ctx.fillText(f.symbol, width - pad, y, inner * 0.3)

  const big = fitText(ctx, f.value, inner, Math.round(Math.min(width / 3.2, height / 7)), '600')
  ctx.fillStyle = p.text
  ctx.textAlign = 'center'
  y += big + 2
  ctx.fillText(f.value, width / 2, y)

  // Window minimum, average and maximum, the average in its line colour.
  const statPx = fitText(ctx, `${f.min} ${f.avg} ${f.max}`, inner, small)
  ctx.font = `${statPx}px 'Helvetica Neue', Arial, sans-serif`
  y += statPx + 4
  ctx.textAlign = 'left'
  ctx.fillStyle = p.muted
  ctx.fillText(f.min, pad, y)
  ctx.textAlign = 'right'
  ctx.fillText(f.max, width - pad, y)
  ctx.textAlign = 'center'
  ctx.fillStyle = p.avg
  ctx.fillText(f.avg, width / 2, y)

  // The strip, with a gutter on the right for the time marks.
  const tickPx = Math.max(7, small - 2)
  ctx.font = `${tickPx}px 'Helvetica Neue', Arial, sans-serif`
  const ticks = timeTicks(f.windowMs)
  const gutter = Math.ceil(Math.max(...ticks.map((t) => ctx.measureText(t.label).width), 0)) + 3
  const top = y + 4
  const left = pad
  const right = width - pad - gutter
  const bottom = height - pad
  const stripH = bottom - top
  const stripW = right - left
  if (stripH < 10 || stripW < 10) return

  ctx.strokeStyle = p.grid
  ctx.lineWidth = 1
  ctx.strokeRect(left + 0.5, top + 0.5, stripW - 1, stripH - 1)
  const yOf = (age: number) => top + (age / f.windowMs) * stripH
  ctx.fillStyle = p.muted
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const t of ticks) {
    const ty = Math.round(yOf(t.age)) + 0.5
    if (t.age < f.windowMs) {
      ctx.beginPath()
      ctx.moveTo(left, ty)
      ctx.lineTo(right, ty)
      ctx.stroke()
    }
    ctx.fillText(t.label, right + 3, Math.min(ty, bottom - tickPx / 2))
  }

  if (!f.stats) {
    if (f.message) {
      ctx.textAlign = 'center'
      ctx.fillStyle = p.muted
      ctx.fillText(f.message, left + stripW / 2, top + stripH / 2, stripW - 4)
    }
    return
  }

  const axis = valueAxis(f.stats, f.minSpan, f.reference)
  const xOf = (v: number) => left + ((v - axis.lo) / (axis.hi - axis.lo)) * stripW
  ctx.fillStyle = p.bar
  for (const b of f.stats.bands) {
    const y0 = yOf(b.ageStart)
    const y1 = Math.min(bottom, yOf(b.ageEnd))
    if (y1 <= top) continue
    const x0 = xOf(b.lo)
    const x1 = Math.max(x0 + 2, xOf(b.hi))
    const yTop = Math.max(top, y0)
    // Half a pixel of overlap, so neighbouring buckets leave no hairline gap.
    ctx.fillRect(x0, yTop, x1 - x0, Math.max(1, y1 - yTop) + 0.5)
  }

  if (f.reference !== undefined) {
    const rx = Math.round(xOf(f.reference)) + 0.5
    ctx.strokeStyle = p.reference
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(rx, top)
    ctx.lineTo(rx, bottom)
    ctx.stroke()
    ctx.setLineDash([])
  }

  const ax = Math.round(xOf(f.stats.avg)) + 0.5
  ctx.strokeStyle = p.avg
  ctx.beginPath()
  ctx.moveTo(ax, top)
  ctx.lineTo(ax, bottom)
  ctx.stroke()
}
