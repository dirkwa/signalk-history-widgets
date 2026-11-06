// Draws a fill level: an upright glass cylinder (3D) or a plain bar (flat),
// filled in the colour of the zone the level is in, with the zone edges marked
// beside it. In 3D the shading (edges darker than the middle, a lit surface, a
// glint on the glass) gives the light depth without leaving the 2D canvas. A
// battery gets a terminal on top.

import type { Level, LevelKind, LevelStyle } from './level-model.js'

interface Liquid {
  edge: string
  middle: string
  surface: string
}

export interface LevelPalette {
  card: string
  text: string
  muted: string
  glass: string
  glassEdge: string
  glint: string
  liquid: Record<Level, Liquid>
  mark: Record<Level, string>
}

export const LEVEL_DAY: LevelPalette = {
  card: 'rgba(20, 26, 32, 0.78)',
  text: '#e8edf2',
  muted: '#9fb3c4',
  glass: 'rgba(255, 255, 255, 0.07)',
  glassEdge: 'rgba(207, 216, 220, 0.75)',
  glint: 'rgba(255, 255, 255, 0.28)',
  liquid: {
    ok: { edge: '#1b5e20', middle: '#66bb6a', surface: '#a5d6a7' },
    warn: { edge: '#e65100', middle: '#fdd835', surface: '#fff59d' },
    alarm: { edge: '#7f0000', middle: '#e53935', surface: '#ef9a9a' }
  },
  mark: { ok: '#66bb6a', warn: '#fdd835', alarm: '#e53935' }
}

// Night keeps the three colours, dark enough not to spoil night vision.
export const LEVEL_NIGHT: LevelPalette = {
  card: 'rgba(8, 0, 0, 0.85)',
  text: '#d32f2f',
  muted: '#8e2424',
  glass: 'rgba(120, 20, 20, 0.08)',
  glassEdge: 'rgba(110, 24, 24, 0.9)',
  glint: 'rgba(160, 40, 40, 0.18)',
  liquid: {
    ok: { edge: '#0b2a0d', middle: '#2e5d31', surface: '#3d7340' },
    warn: { edge: '#3d2600', middle: '#7a6a10', surface: '#8f7d1c' },
    alarm: { edge: '#3a0000', middle: '#8e1b1b', surface: '#b02a2a' }
  },
  mark: { ok: '#2e5d31', warn: '#7a6a10', alarm: '#b02a2a' }
}

export interface LevelFrame {
  title: string
  /** 0..1, or undefined while no current reading is in. */
  fraction: number | undefined
  level: Level
  /** The level as shown, e.g. `42 %`. */
  valueText: string
  /** The volume left or the voltage, e.g. `168 l`; blank when not shown. */
  detailText: string
  kind: LevelKind
  style: LevelStyle
  marks: { at: number; level: Level }[]
  palette: LevelPalette
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxWidth: number,
  weight = ''
): void {
  let px = size
  ctx.font = `${weight} ${px}px 'Helvetica Neue', Arial, sans-serif`
  while (px > 8 && ctx.measureText(text).width > maxWidth) {
    px -= 1
    ctx.font = `${weight} ${px}px 'Helvetica Neue', Arial, sans-serif`
  }
}

/** The cylinder's side and front half of its bottom, as one closed path. */
function bodyPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  rx: number,
  ry: number,
  top: number,
  bottom: number
): void {
  ctx.beginPath()
  ctx.moveTo(cx - rx, top)
  ctx.lineTo(cx - rx, bottom)
  ctx.ellipse(cx, bottom, rx, ry, 0, Math.PI, 0, true)
  ctx.lineTo(cx + rx, top)
  ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI, false)
  ctx.closePath()
}

function sideShade(
  ctx: CanvasRenderingContext2D,
  cx: number,
  rx: number,
  edge: string,
  middle: string
): CanvasGradient {
  const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0)
  g.addColorStop(0, edge)
  g.addColorStop(0.35, middle)
  g.addColorStop(0.55, middle)
  g.addColorStop(1, edge)
  return g
}

interface Box {
  cx: number
  rx: number
  top: number
  bottom: number
}

/** The level's height in the box, clamped to it. */
function surfaceAt(b: Box, fraction: number): number {
  return b.bottom - Math.min(1, Math.max(0, fraction)) * (b.bottom - b.top)
}

function draw3d(ctx: CanvasRenderingContext2D, b: Box, f: LevelFrame): void {
  const p = f.palette
  const { cx, rx, top, bottom } = b
  const ry = rx * 0.22

  // The far wall, seen through the glass.
  bodyPath(ctx, cx, rx, ry, top, bottom)
  ctx.fillStyle = p.glass
  ctx.fill()

  if (f.fraction !== undefined) {
    const liquid = p.liquid[f.level]
    const surface = surfaceAt(b, f.fraction)
    bodyPath(ctx, cx, rx, ry, surface, bottom)
    ctx.fillStyle = sideShade(ctx, cx, rx, liquid.edge, liquid.middle)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx, surface, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = liquid.surface
    ctx.fill()
  }

  // A glint down the glass on the lit side.
  const glint = ctx.createLinearGradient(cx - rx * 0.7, 0, cx - rx * 0.35, 0)
  glint.addColorStop(0, 'rgba(255, 255, 255, 0)')
  glint.addColorStop(0.5, p.glint)
  glint.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glint
  ctx.fillRect(cx - rx * 0.7, top + ry, rx * 0.35, bottom - top - ry)

  ctx.lineWidth = Math.max(1, rx * 0.04)
  ctx.strokeStyle = p.glassEdge
  bodyPath(ctx, cx, rx, ry, top, bottom)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2)
  ctx.stroke()

  if (f.kind === 'battery') {
    // The terminal: a small cylinder standing on the lid.
    const tx = rx * 0.32
    const ty = tx * 0.22
    const height = rx * 0.22
    bodyPath(ctx, cx, tx, ty, top - height, top)
    ctx.fillStyle = sideShade(ctx, cx, tx, p.glassEdge, p.text)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx, top - height, tx, ty, 0, 0, Math.PI * 2)
    ctx.fillStyle = p.text
    ctx.fill()
  }
}

function drawFlat(ctx: CanvasRenderingContext2D, b: Box, f: LevelFrame): void {
  const p = f.palette
  const { cx, rx, top, bottom } = b
  const radius = Math.min(rx * 0.25, 8)
  const line = Math.max(1, rx * 0.04)

  roundRect(ctx, cx - rx, top, 2 * rx, bottom - top, radius)
  ctx.fillStyle = p.glass
  ctx.fill()

  if (f.fraction !== undefined) {
    const surface = surfaceAt(b, f.fraction)
    ctx.save()
    roundRect(ctx, cx - rx, top, 2 * rx, bottom - top, radius)
    ctx.clip()
    ctx.fillStyle = p.liquid[f.level].middle
    ctx.fillRect(cx - rx, surface, 2 * rx, bottom - surface)
    ctx.restore()
  }

  ctx.lineWidth = line
  ctx.strokeStyle = p.glassEdge
  roundRect(ctx, cx - rx, top, 2 * rx, bottom - top, radius)
  ctx.stroke()

  if (f.kind === 'battery') {
    const tw = rx * 0.6
    const th = rx * 0.18
    roundRect(ctx, cx - tw / 2, top - th, tw, th, Math.min(th / 2, 3))
    ctx.fillStyle = p.glassEdge
    ctx.fill()
  }
}

export function drawLevel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: LevelFrame
): void {
  const p = f.palette
  ctx.clearRect(0, 0, w, h)
  roundRect(ctx, 0, 0, w, h, Math.min(10, w / 10))
  ctx.fillStyle = p.card
  ctx.fill()

  const pad = Math.max(6, Math.min(w, h) * 0.06)
  // A tall cell stacks the bar over the reading; a square or wide one puts
  // the reading beside the bar, so the bar keeps its height in a 1x1 cell.
  const side = w >= h * 0.8
  const titleSize = Math.max(10, Math.min(w * 0.11, h * (side ? 0.1 : 0.06)))
  const valueSize = Math.max(14, side ? Math.min(w * 0.17, h * 0.2) : Math.min(w * 0.2, h * 0.11))
  const detailSize = Math.max(9, valueSize * 0.5)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = p.muted
  fitText(ctx, f.title, titleSize, w - 2 * pad)
  ctx.fillText(f.title, w / 2, pad)

  const footer = side ? 0 : valueSize + (f.detailText ? detailSize * 1.2 : 0) + pad
  const areaTop = pad + titleSize * 1.5
  const areaBottom = h - footer - pad * 0.5
  const rx = Math.min(side ? w * 0.15 : w * 0.27, (areaBottom - areaTop) * 0.4)
  // Room above the body for the 3D lid and the battery terminal.
  const headroom = rx * (f.style === '3d' ? 0.22 : 0) + (f.kind === 'battery' ? rx * 0.22 : 0)
  const box: Box = {
    cx: side ? pad + rx : w / 2 - rx * 0.15,
    rx,
    top: areaTop + headroom,
    bottom: areaBottom - (f.style === '3d' ? rx * 0.22 : 0)
  }
  if (box.bottom - box.top < 4) return

  if (f.style === 'flat') drawFlat(ctx, box, f)
  else draw3d(ctx, box, f)

  // Quarter ticks and the zone edges on the right.
  const tickX = box.cx + rx + Math.max(3, rx * 0.12)
  const yAt = (at: number) => surfaceAt(box, at)
  ctx.lineCap = 'round'
  ctx.strokeStyle = p.muted
  ctx.lineWidth = Math.max(1, rx * 0.03)
  for (const at of [0.25, 0.5, 0.75]) {
    ctx.beginPath()
    ctx.moveTo(tickX, yAt(at))
    ctx.lineTo(tickX + rx * 0.18, yAt(at))
    ctx.stroke()
  }
  ctx.lineWidth = Math.max(2, rx * 0.09)
  for (const m of f.marks) {
    ctx.strokeStyle = p.mark[m.level]
    ctx.beginPath()
    ctx.moveTo(tickX, yAt(m.at))
    ctx.lineTo(tickX + rx * 0.32, yAt(m.at))
    ctx.stroke()
  }

  // The reading: under the bar, or centred in the room right of the ticks.
  const textLeft = side ? tickX + rx * 0.32 + pad * 0.5 : pad
  const textW = w - pad - textLeft
  const textCx = textLeft + textW / 2
  const block = valueSize + (f.detailText ? detailSize * 1.2 : 0)
  const blockBottom = side ? (areaTop + areaBottom + block) / 2 : h - pad
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = f.fraction === undefined ? p.muted : p.text
  fitText(ctx, f.valueText, valueSize, textW, 'bold')
  const valueBase = blockBottom - (f.detailText ? detailSize * 1.2 : 0)
  ctx.fillText(f.valueText, textCx, valueBase)
  if (f.detailText) {
    ctx.fillStyle = p.muted
    fitText(ctx, f.detailText, detailSize, textW)
    ctx.fillText(f.detailText, textCx, blockBottom)
  }
}
