// Draws the depth profile like an echo sounder: time runs left to right with
// now at the right edge, depth runs down from the surface, and the seabed is
// filled in below the shallowest reading of each moment.

import { depthAxis } from './depth-model.js'
import { timeTicks } from './render.js'

export interface DepthPalette {
  card: string
  waterTop: string
  waterBottom: string
  seabed: string
  seabedEdge: string
  text: string
  muted: string
  grid: string
}

export const DEPTH_DAY: DepthPalette = {
  card: 'rgba(20, 26, 32, 0.78)',
  waterTop: 'rgba(41, 182, 246, 0.30)',
  waterBottom: 'rgba(13, 71, 161, 0.55)',
  seabed: '#8d6e63',
  seabedEdge: '#d7ccc8',
  text: '#e8edf2',
  muted: '#9fb3c4',
  grid: 'rgba(255, 255, 255, 0.22)'
}

export const DEPTH_NIGHT: DepthPalette = {
  card: 'rgba(8, 0, 0, 0.85)',
  waterTop: 'rgba(40, 0, 0, 0.4)',
  waterBottom: 'rgba(60, 0, 0, 0.6)',
  seabed: '#4a0c0c',
  seabedEdge: '#b71c1c',
  text: '#d32f2f',
  muted: '#8e2424',
  grid: 'rgba(211, 47, 47, 0.3)'
}

/** One time bucket's depths in display units, shallowest and deepest. */
export interface DepthBand {
  ageStart: number
  ageEnd: number
  lo: number
  hi: number
}

export interface DepthFrame {
  title: string
  value: string
  symbol: string
  windowMs: number
  bands: DepthBand[]
  message: string
  palette: DepthPalette
}

const FONT = "'Helvetica Neue', Arial, sans-serif"

/** Axis labels with as many decimals as the step needs (2.5 → one). */
export function depthLabel(depth: number, step: number): string {
  const decimals = Number.isInteger(step) ? 0 : step * 10 === Math.round(step * 10) ? 1 : 2
  return depth.toFixed(decimals)
}

export function drawDepth(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: DepthFrame
): void {
  const p = f.palette
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = p.card
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 10)
  ctx.fill()

  const pad = Math.max(4, Math.round(Math.min(w, h) * 0.05))
  const small = Math.max(8, Math.round(Math.min(w / 18, h / 9)))
  const deepest = f.bands.reduce((m, b) => Math.max(m, b.hi), 0)
  const axis = depthAxis(deepest)
  const marks: number[] = []
  for (let d = 0; d <= axis.max + axis.step / 1000; d += axis.step) marks.push(d)

  ctx.font = `${small}px ${FONT}`
  const gutter =
    Math.ceil(Math.max(...marks.map((d) => ctx.measureText(depthLabel(d, axis.step)).width))) + 4
  const left = pad
  const right = w - pad - gutter
  const top = pad
  const bottom = h - pad - small - 2
  const plotW = right - left
  const plotH = bottom - top
  if (plotW < 10 || plotH < 10) return

  const xOf = (age: number) => right - (age / f.windowMs) * plotW
  const yOf = (depth: number) => top + (Math.max(0, depth) / axis.max) * plotH

  const water = ctx.createLinearGradient(0, top, 0, bottom)
  water.addColorStop(0, p.waterTop)
  water.addColorStop(1, p.waterBottom)
  ctx.fillStyle = water
  ctx.fillRect(left, top, plotW, plotH)

  // Each moment's shallowest reading sets the seabed: the safe side to show.
  ctx.fillStyle = p.seabed
  for (const b of f.bands) {
    const x0 = Math.max(left, xOf(b.ageEnd))
    const x1 = Math.min(right, xOf(b.ageStart))
    if (x1 <= left) continue
    // Half a pixel of overlap, so neighbouring buckets leave no hairline gap.
    ctx.fillRect(x0, yOf(b.lo), x1 - x0 + 0.5, bottom - yOf(b.lo))
  }
  ctx.fillStyle = p.seabedEdge
  for (const b of f.bands) {
    const x0 = Math.max(left, xOf(b.ageEnd))
    const x1 = Math.min(right, xOf(b.ageStart))
    if (x1 <= left) continue
    ctx.fillRect(x0, yOf(b.lo) - 1, x1 - x0 + 0.5, 2)
  }

  // Depth marks on the right, time marks along the bottom.
  ctx.strokeStyle = p.grid
  ctx.lineWidth = 1
  ctx.fillStyle = p.muted
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  // In a short widget only every other mark is labelled, so labels never touch.
  const every = Math.ceil((small * 1.3) / (plotH / (marks.length - 1)))
  marks.forEach((d, i) => {
    const y = Math.round(yOf(d)) + 0.5
    if (d > 0 && d < axis.max) {
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
    }
    if (i % every !== 0) return
    ctx.fillText(
      depthLabel(d, axis.step),
      right + 4,
      Math.min(Math.max(y, top + small / 2), bottom)
    )
  })
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  for (const t of timeTicks(f.windowMs)) {
    const x = Math.round(xOf(t.age)) + 0.5
    if (t.age < f.windowMs) {
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.stroke()
    }
    ctx.fillText(
      /h$/.test(t.label) ? t.label : `${t.label} min`,
      Math.max(x, left + 2 * small),
      h - pad
    )
  }
  ctx.strokeRect(left + 0.5, top + 0.5, plotW - 1, plotH - 1)

  // The reading sits top left; a shadow keeps it readable over a shoal.
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
  ctx.shadowBlur = 4
  ctx.textAlign = 'left'
  ctx.fillStyle = p.muted
  ctx.font = `600 ${small}px ${FONT}`
  ctx.fillText(f.title, left + pad, top + pad + small, plotW - 2 * pad)
  const big = Math.round(Math.min(plotH * 0.38, plotW / 4))
  ctx.font = `600 ${big}px ${FONT}`
  ctx.fillStyle = p.text
  const valueY = top + pad + small + big
  ctx.fillText(f.value, left + pad, valueY)
  const valueW = ctx.measureText(f.value).width
  ctx.font = `${small}px ${FONT}`
  ctx.fillStyle = p.muted
  ctx.fillText(f.symbol, left + pad + valueW + 4, valueY)
  ctx.restore()

  if (f.bands.length === 0) {
    ctx.textAlign = 'center'
    ctx.fillText(f.message, left + plotW / 2, top + plotH * 0.75, plotW - 4)
  }
}
