// Draws the wind steering dial. Every angle in a frame is off the bow,
// clockwise, so the bow is always up; in compass mode the card's labels turn
// with the heading underneath.

import { compassText, unsigned, type DialMode } from './steer-model.js'

export interface SteerPalette {
  card: string
  ring: string
  ringText: string
  text: string
  muted: string
  port: string
  starboard: string
  apparent: string
  trueWind: string
  shift: string
  waypoint: string
  course: string
  current: string
}

export const STEER_DAY: SteerPalette = {
  card: 'rgba(20, 26, 32, 0.78)',
  ring: '#cfd8dc',
  ringText: '#1d2329',
  text: '#e8edf2',
  muted: '#9fb3c4',
  port: '#e53935',
  starboard: '#43a047',
  apparent: '#29b6f6',
  trueWind: '#ffa726',
  shift: 'rgba(255, 167, 38, 0.28)',
  waypoint: '#ab47bc',
  course: '#ec407a',
  current: '#26c6da'
}

export const STEER_NIGHT: SteerPalette = {
  card: 'rgba(8, 0, 0, 0.85)',
  ring: '#4a0c0c',
  ringText: '#d32f2f',
  text: '#d32f2f',
  muted: '#8e2424',
  port: '#b71c1c',
  starboard: '#7f1212',
  apparent: '#ff5252',
  trueWind: '#d32f2f',
  shift: 'rgba(211, 47, 47, 0.22)',
  waypoint: '#c62828',
  course: '#e57373',
  current: '#ef9a9a'
}

/** One labelled reading in a corner. */
export interface Readout {
  label: string
  value: string
  unit: string
}

export interface SteerFrame {
  dial: DialMode
  /** The heading the compass card shows, rad; undefined leaves the card blank. */
  heading?: number
  apparent?: number
  trueWind?: number
  /** The wind shift fan, as angles off the bow. */
  shift?: { from: number; to: number }
  /** The tack lines' angle off the true wind, rad. */
  closeHauled?: number
  waypoint?: number
  course?: number
  current?: { angle: number; fraction: number; text: string }
  /** Rudder angle, rad; positive is to starboard. */
  rudder?: number
  topLeft: Readout
  topRight: Readout
  bottomLeft: Readout
  bottomRight: Readout
  palette: SteerPalette
}

const DEG = Math.PI / 180
const RUDDER_FULL = 35 * DEG
const FONT = "'Helvetica Neue', Arial, sans-serif"

interface Dial {
  cx: number
  cy: number
  r: number
  band: number
}

function at(d: Dial, angle: number, radius: number): [number, number] {
  return [d.cx + radius * Math.sin(angle), d.cy - radius * Math.cos(angle)]
}

/** The canvas arc angle for an angle off the bow. */
function arcAngle(angle: number): number {
  return angle - Math.PI / 2
}

/** The angles a sector covers, clockwise from `from` to `to`. */
export function sweep(from: number, to: number): number {
  return unsigned(to - from)
}

function ring(ctx: CanvasRenderingContext2D, d: Dial, f: SteerFrame): void {
  const p = f.palette
  const mid = d.r - d.band / 2
  ctx.lineWidth = d.band
  ctx.strokeStyle = p.ring
  ctx.beginPath()
  ctx.arc(d.cx, d.cy, mid, 0, 2 * Math.PI)
  ctx.stroke()

  // The close-hauled bands either side of the bow, as on a wind instrument,
  // along the inner edge so the card's labels stay readable.
  ctx.lineWidth = d.band * 0.2
  for (const [colour, from, to] of [
    [p.port, -60 * DEG, -20 * DEG],
    [p.starboard, 20 * DEG, 60 * DEG]
  ] as const) {
    ctx.strokeStyle = colour
    ctx.beginPath()
    ctx.arc(d.cx, d.cy, d.r - d.band * 0.9, arcAngle(from), arcAngle(to))
    ctx.stroke()
  }

  const card = f.dial === 'compass' ? f.heading : 0
  ctx.strokeStyle = p.ringText
  ctx.fillStyle = p.ringText
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.max(8, d.band * 0.5)}px ${FONT}`
  if (card === undefined) return
  for (let deg = 0; deg < 360; deg += 10) {
    const angle = deg * DEG - card
    const major = deg % 30 === 0
    ctx.lineWidth = major ? 2 : 1
    const [x0, y0] = at(d, angle, d.r)
    const [x1, y1] = at(d, angle, d.r - d.band * (major ? 0.28 : 0.18))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    if (!major) continue
    const label = f.dial === 'compass' ? compassLabel(deg) : String(deg > 180 ? 360 - deg : deg)
    const [tx, ty] = at(d, angle, d.r - d.band * 0.62)
    ctx.save()
    ctx.translate(tx, ty)
    ctx.rotate(angle)
    ctx.fillText(label, 0, 0)
    ctx.restore()
  }
}

function compassLabel(deg: number): string {
  const cardinal: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
  return cardinal[deg] ?? String(deg)
}

function line(
  ctx: CanvasRenderingContext2D,
  d: Dial,
  angle: number,
  colour: string,
  dashed: boolean
): void {
  const [x, y] = at(d, angle, d.r - d.band)
  ctx.strokeStyle = colour
  ctx.lineWidth = Math.max(1.5, d.r * 0.012)
  ctx.setLineDash(dashed ? [d.r * 0.05, d.r * 0.04] : [])
  ctx.beginPath()
  ctx.moveTo(d.cx, d.cy)
  ctx.lineTo(x, y)
  ctx.stroke()
  ctx.setLineDash([])
}

function shiftFan(ctx: CanvasRenderingContext2D, d: Dial, f: SteerFrame): void {
  if (!f.shift) return
  ctx.fillStyle = f.palette.shift
  ctx.beginPath()
  ctx.moveTo(d.cx, d.cy)
  const start = arcAngle(f.shift.from)
  ctx.arc(d.cx, d.cy, d.r - d.band, start, start + sweep(f.shift.from, f.shift.to))
  ctx.closePath()
  ctx.fill()
}

/** A pointer from the inner edge of the ring toward the centre. */
function pointer(
  ctx: CanvasRenderingContext2D,
  d: Dial,
  angle: number,
  colour: string,
  letter: string,
  length: number
): void {
  const inner = d.r - d.band
  const tip = at(d, angle, inner * (1 - length))
  const half = d.r * 0.07
  const base = at(d, angle, inner)
  const left = [base[0] - half * Math.cos(angle), base[1] - half * Math.sin(angle)] as const
  const right = [base[0] + half * Math.cos(angle), base[1] + half * Math.sin(angle)] as const
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(tip[0], tip[1])
  ctx.lineTo(left[0], left[1])
  ctx.lineTo(right[0], right[1])
  ctx.closePath()
  ctx.fill()
  const [lx, ly] = at(d, angle, inner - d.r * 0.07)
  ctx.fillStyle = '#10161b'
  ctx.font = `700 ${Math.max(8, d.r * 0.075)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(letter, lx, ly)
}

/** A marker sitting on the ring. */
function ringMark(
  ctx: CanvasRenderingContext2D,
  d: Dial,
  angle: number,
  colour: string,
  shape: 'dot' | 'diamond'
): void {
  const [x, y] = at(d, angle, d.r - d.band / 2)
  const s = d.band * 0.32
  ctx.fillStyle = colour
  ctx.strokeStyle = '#10161b'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  if (shape === 'dot') {
    ctx.arc(x, y, s, 0, 2 * Math.PI)
  } else {
    ctx.moveTo(x + s * Math.sin(angle), y - s * Math.cos(angle))
    ctx.lineTo(x + s * Math.cos(angle), y + s * Math.sin(angle))
    ctx.lineTo(x - s * Math.sin(angle), y + s * Math.cos(angle))
    ctx.lineTo(x - s * Math.cos(angle), y - s * Math.sin(angle))
    ctx.closePath()
  }
  ctx.fill()
  ctx.stroke()
}

function current(ctx: CanvasRenderingContext2D, d: Dial, f: SteerFrame): void {
  const c = f.current
  if (!c) return
  const inner = d.r - d.band
  const length = inner * (0.25 + 0.45 * Math.min(1, c.fraction))
  const [x, y] = at(d, c.angle, length)
  const head = d.r * 0.06
  ctx.strokeStyle = f.palette.current
  ctx.fillStyle = f.palette.current
  ctx.lineWidth = Math.max(2, d.r * 0.02)
  ctx.beginPath()
  ctx.moveTo(d.cx, d.cy)
  ctx.lineTo(x, y)
  ctx.stroke()
  const [bx, by] = at(d, c.angle, length - head * 1.6)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(bx + head * Math.cos(c.angle), by + head * Math.sin(c.angle))
  ctx.lineTo(bx - head * Math.cos(c.angle), by - head * Math.sin(c.angle))
  ctx.closePath()
  ctx.fill()
  const [tx, ty] = at(d, c.angle, length + d.r * 0.09)
  ctx.font = `600 ${Math.max(8, d.r * 0.075)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(c.text, tx, ty)
}

function hull(ctx: CanvasRenderingContext2D, d: Dial, f: SteerFrame): void {
  const l = d.r * 0.38
  const b = l * 0.34
  ctx.strokeStyle = f.palette.muted
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(d.cx, d.cy - l)
  ctx.bezierCurveTo(
    d.cx + b * 1.1,
    d.cy - l * 0.45,
    d.cx + b,
    d.cy + l * 0.5,
    d.cx + b * 0.7,
    d.cy + l * 0.8
  )
  ctx.lineTo(d.cx - b * 0.7, d.cy + l * 0.8)
  ctx.bezierCurveTo(d.cx - b, d.cy + l * 0.5, d.cx - b * 1.1, d.cy - l * 0.45, d.cx, d.cy - l)
  ctx.stroke()
}

function lubber(ctx: CanvasRenderingContext2D, d: Dial, f: SteerFrame): void {
  const s = d.band * 0.45
  const top = d.cy - d.r
  ctx.fillStyle = f.palette.text
  ctx.beginPath()
  ctx.moveTo(d.cx, top + s)
  ctx.lineTo(d.cx - s * 0.7, top - s * 0.25)
  ctx.lineTo(d.cx + s * 0.7, top - s * 0.25)
  ctx.closePath()
  ctx.fill()
}

function readout(
  ctx: CanvasRenderingContext2D,
  r: Readout,
  x: number,
  y: number,
  align: CanvasTextAlign,
  size: number,
  p: SteerPalette,
  below: boolean
): void {
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  const labelSize = size * 0.5
  const labelY = below ? y - size - labelSize - 2 : y
  const valueY = below ? y - size : y + labelSize + 2
  ctx.fillStyle = p.muted
  ctx.font = `600 ${labelSize}px ${FONT}`
  ctx.fillText(r.unit ? `${r.label} ${r.unit}` : r.label, x, labelY)
  ctx.fillStyle = p.text
  ctx.font = `700 ${size}px ${FONT}`
  ctx.fillText(r.value, x, valueY)
}

function rudderBar(ctx: CanvasRenderingContext2D, d: Dial, f: SteerFrame, y: number): void {
  if (f.rudder === undefined) return
  const half = d.r * 0.55
  const h = Math.max(4, d.r * 0.05)
  ctx.fillStyle = f.palette.ring
  ctx.globalAlpha = 0.35
  ctx.fillRect(d.cx - half, y, half * 2, h)
  ctx.globalAlpha = 1
  const share = Math.max(-1, Math.min(1, f.rudder / RUDDER_FULL))
  ctx.fillStyle = share < 0 ? f.palette.port : f.palette.starboard
  ctx.fillRect(Math.min(d.cx, d.cx + share * half), y, Math.abs(share) * half, h)
  ctx.fillStyle = f.palette.text
  ctx.fillRect(d.cx - 1, y - 2, 2, h + 4)
}

export function drawSteer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: SteerFrame
): void {
  const p = f.palette
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = p.card
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 8)
  ctx.fill()

  const pad = Math.max(4, Math.min(w, h) * 0.03)
  const rudderRoom = f.rudder === undefined ? 0 : Math.min(w, h) * 0.06
  const r = Math.max(10, Math.min(w, h - rudderRoom) / 2 - pad)
  const d: Dial = { cx: w / 2, cy: (h - rudderRoom) / 2, r, band: r * 0.16 }

  shiftFan(ctx, d, f)
  ring(ctx, d, f)
  hull(ctx, d, f)
  if (f.trueWind !== undefined && f.closeHauled !== undefined) {
    line(ctx, d, f.trueWind + f.closeHauled, p.port, true)
    line(ctx, d, f.trueWind - f.closeHauled, p.starboard, true)
  }
  if (f.waypoint !== undefined) ringMark(ctx, d, f.waypoint, p.waypoint, 'dot')
  if (f.course !== undefined) ringMark(ctx, d, f.course, p.course, 'diamond')
  current(ctx, d, f)
  if (f.trueWind !== undefined) pointer(ctx, d, f.trueWind, p.trueWind, 'T', 0.22)
  if (f.apparent !== undefined) pointer(ctx, d, f.apparent, p.apparent, 'A', 0.5)
  lubber(ctx, d, f)

  ctx.fillStyle = p.text
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.max(10, r * 0.2)}px ${FONT}`
  ctx.fillText(f.heading === undefined ? '---' : `${compassText(f.heading)}°`, d.cx, d.cy)

  const size = Math.max(10, Math.min(w, h) * 0.075)
  readout(ctx, f.topLeft, pad, pad, 'left', size, p, false)
  readout(ctx, f.topRight, w - pad, pad, 'right', size, p, false)
  readout(ctx, f.bottomLeft, pad, h - pad, 'left', size, p, true)
  readout(ctx, f.bottomRight, w - pad, h - pad, 'right', size, p, true)
  rudderBar(ctx, d, f, d.cy + r + pad * 0.6)
}
