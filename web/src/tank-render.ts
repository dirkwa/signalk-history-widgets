// Draws the tank: an upright glass cylinder, filled to the level in the colour
// of the zone the level is in, with the zone edges marked beside it. The
// shading (edges darker than the middle, a lit surface, a glint on the glass)
// gives it a light 3D look without leaving the 2D canvas.

import type { Level } from './tank-model.js'

interface Liquid {
  edge: string
  middle: string
  surface: string
}

export interface TankPalette {
  card: string
  text: string
  muted: string
  glass: string
  glassEdge: string
  glint: string
  liquid: Record<Level, Liquid>
  mark: Record<Level, string>
}

export const TANK_DAY: TankPalette = {
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
export const TANK_NIGHT: TankPalette = {
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

export interface TankFrame {
  title: string
  /** 0..1, or undefined while no current reading is in. */
  fraction: number | undefined
  level: Level
  /** The level as shown, e.g. `42 %`. */
  valueText: string
  /** The volume left, e.g. `168 l`; blank when not shown. */
  volumeText: string
  marks: { at: number; level: Level }[]
  palette: TankPalette
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

export function drawTank(ctx: CanvasRenderingContext2D, w: number, h: number, f: TankFrame): void {
  const p = f.palette
  ctx.clearRect(0, 0, w, h)
  roundRect(ctx, 0, 0, w, h, Math.min(10, w / 10))
  ctx.fillStyle = p.card
  ctx.fill()

  const pad = Math.max(6, Math.min(w, h) * 0.06)
  const titleSize = Math.max(10, Math.min(w * 0.11, h * 0.06))
  const valueSize = Math.max(14, Math.min(w * 0.2, h * 0.11))
  const volumeSize = Math.max(9, valueSize * 0.5)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = p.muted
  fitText(ctx, f.title, titleSize, w - 2 * pad)
  ctx.fillText(f.title, w / 2, pad)

  const footer = valueSize + (f.volumeText ? volumeSize * 1.2 : 0) + pad
  const areaTop = pad + titleSize * 1.5
  const areaBottom = h - footer - pad * 0.5
  const rx = Math.min(w * 0.27, (areaBottom - areaTop) * 0.4)
  const ry = rx * 0.22
  const cx = w / 2 - rx * 0.15
  const top = areaTop + ry
  const bottom = areaBottom - ry
  if (bottom - top < 4) return

  // The far wall, seen through the glass.
  bodyPath(ctx, cx, rx, ry, top, bottom)
  ctx.fillStyle = p.glass
  ctx.fill()

  if (f.fraction !== undefined) {
    const liquid = p.liquid[f.level]
    const surface = bottom - Math.min(1, Math.max(0, f.fraction)) * (bottom - top)
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

  // Quarter ticks and the zone edges on the right.
  const tickX = cx + rx + Math.max(3, rx * 0.12)
  const yAt = (at: number) => bottom - at * (bottom - top)
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

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = f.fraction === undefined ? p.muted : p.text
  fitText(ctx, f.valueText, valueSize, w - 2 * pad, 'bold')
  const valueBase = h - pad - (f.volumeText ? volumeSize * 1.2 : 0)
  ctx.fillText(f.valueText, w / 2, valueBase)
  if (f.volumeText) {
    ctx.fillStyle = p.muted
    fitText(ctx, f.volumeText, volumeSize, w - 2 * pad)
    ctx.fillText(f.volumeText, w / 2, h - pad)
  }
}
