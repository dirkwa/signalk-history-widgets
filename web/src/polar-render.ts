// Draws the polar performance tile: a gauge from 0 to 120 % with a mark at
// the polar, the percentage in large type inside it, and actual against
// polar speed underneath. The gauge and the number take the colour of their
// zone.

import type { Level } from './level-model.js'
import type { LevelPalette } from './level-render.js'
import { GAUGE_MAX } from './polar-model.js'

export interface PolarFrame {
  title: string
  /** The averaged ratio, or undefined while none is current. */
  ratio: number | undefined
  text: string
  /** Under the number: the speeds, or that the polar has no target. */
  detail: string
  level: Level
  palette: LevelPalette
}

const FONT = "'Helvetica Neue', Arial, sans-serif"
/** The gauge opens downwards: 270° from lower left to lower right. */
const START = (3 * Math.PI) / 4
const SWEEP = (3 * Math.PI) / 2

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxWidth: number,
  weight = ''
): void {
  let px = Math.floor(size)
  ctx.font = `${weight} ${px}px ${FONT}`
  while (px > 7 && ctx.measureText(text).width > maxWidth) {
    px -= 1
    ctx.font = `${weight} ${px}px ${FONT}`
  }
}

/** The gauge angle of a ratio, pinned to the gauge's ends. */
export function gaugeAngle(ratio: number): number {
  return START + SWEEP * (Math.min(GAUGE_MAX, Math.max(0, ratio)) / GAUGE_MAX)
}

export function drawPolar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: PolarFrame
): void {
  const p = f.palette
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = p.card
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, Math.min(10, w / 10))
  ctx.fill()

  const pad = Math.max(5, Math.min(w, h) * 0.07)
  const inner = w - 2 * pad
  const titleSize = Math.max(9, h * 0.12)
  const detailSize = Math.max(8, h * 0.11)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = p.muted
  fitText(ctx, f.title, titleSize, inner)
  ctx.fillText(f.title, w / 2, pad)

  const top = pad + titleSize * 1.2
  const bottom = h - pad - detailSize * 1.2
  const cx = w / 2
  const radius = Math.max(4, Math.min(inner / 2, (bottom - top) / (1 + Math.SQRT1_2)))
  const cy = top + radius
  const line = Math.max(3, radius * 0.16)

  ctx.lineCap = 'round'
  ctx.lineWidth = line
  ctx.strokeStyle = p.glass
  ctx.beginPath()
  ctx.arc(cx, cy, radius - line / 2, START, START + SWEEP)
  ctx.stroke()
  const known = f.ratio !== undefined
  if (f.ratio !== undefined && f.ratio > 0) {
    ctx.strokeStyle = p.liquid[f.level].middle
    ctx.beginPath()
    ctx.arc(cx, cy, radius - line / 2, START, gaugeAngle(f.ratio))
    ctx.stroke()
  }

  // The polar's own mark crosses the band, so a full gauge still shows it.
  const polar = gaugeAngle(1)
  const at = (r: number): [number, number] => [cx + Math.cos(polar) * r, cy + Math.sin(polar) * r]
  ctx.lineCap = 'butt'
  ctx.lineWidth = Math.max(1.5, line * 0.3)
  ctx.strokeStyle = p.text
  ctx.beginPath()
  ctx.moveTo(...at(radius - line * 1.15))
  ctx.lineTo(...at(radius + line * 0.15))
  ctx.stroke()

  ctx.textBaseline = 'middle'
  ctx.fillStyle = !known ? p.muted : f.level === 'ok' ? p.text : p.mark[f.level]
  fitText(ctx, f.text, radius * 0.6, (radius - line * 1.6) * 1.5, 'bold')
  ctx.fillText(f.text, cx, cy + radius * 0.03)

  if (f.detail) {
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = p.muted
    fitText(ctx, f.detail, detailSize, inner)
    ctx.fillText(f.detail, w / 2, h - pad)
  }
}
