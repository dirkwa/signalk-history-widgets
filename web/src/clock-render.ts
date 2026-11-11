// Draws the clock: which zone it shows on top, the time as large as the cell
// allows, the date underneath.

export interface ClockPalette {
  card: string
  text: string
  muted: string
}

export const CLOCK_DAY: ClockPalette = {
  card: 'rgba(20, 26, 32, 0.78)',
  text: '#e8edf2',
  muted: '#9fb3c4'
}

export const CLOCK_LIGHT: ClockPalette = {
  card: 'rgba(246, 248, 250, 0.9)',
  text: '#1d2329',
  muted: '#546e7a'
}

export const CLOCK_NIGHT: ClockPalette = {
  card: 'rgba(8, 0, 0, 0.85)',
  text: '#d32f2f',
  muted: '#8e2424'
}

export interface ClockFrame {
  title: string
  /** The end of `title` that must stay readable when it is shortened. */
  keep?: string
  time: string
  /** Empty when the date is hidden. */
  date: string
  palette: ClockPalette
}

const FONT = "'Helvetica Neue', Arial, sans-serif"

/** The largest size up to `size` at which `text` fits in `maxWidth`. */
export function fitSize(measure: (px: number) => number, maxWidth: number, size: number): number {
  let px = Math.floor(size)
  while (px > 7 && measure(px) > maxWidth) px--
  return px
}

/**
 * `text` cut down with an ellipsis until `fits` accepts it. The part before
 * `keep` (a suffix of `text`) goes first; `keep` itself is cut only once
 * nothing else is left.
 */
export function shorten(text: string, keep: string, fits: (s: string) => boolean): string {
  if (fits(text)) return text
  const end = keep && text.endsWith(keep) ? keep : ''
  const head = text.slice(0, text.length - end.length)
  for (let n = head.length - 1; n > 0; n--) {
    const s = `${head.slice(0, n).trimEnd()}…${end ? ` ${end}` : ''}`
    if (fits(s)) return s
  }
  for (let n = (end || head).length - 1; n > 0; n--) {
    const s = `${(end || head).slice(0, n).trimEnd()}…`
    if (fits(s)) return s
  }
  return '…'
}

function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  weight = ''
): number {
  const px = fitSize(
    (s) => {
      ctx.font = `${weight} ${s}px ${FONT}`
      return ctx.measureText(text).width
    },
    maxWidth,
    size
  )
  ctx.font = `${weight} ${px}px ${FONT}`
  return px
}

export function drawClock(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: ClockFrame
): void {
  const p = f.palette
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = p.card
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 8)
  ctx.fill()

  const pad = Math.max(4, Math.min(w, h) * 0.06)
  const inner = w - 2 * pad
  const small = Math.max(9, Math.min(h * 0.14, w * 0.08))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const titlePx = fit(ctx, f.title, inner, small)
  const title = shorten(f.title, f.keep ?? '', (t) => ctx.measureText(t).width <= inner)
  ctx.fillStyle = p.muted
  ctx.fillText(title, w / 2, pad + titlePx)

  const datePx = f.date ? small : 0
  const top = pad + titlePx
  const bottom = h - pad - (f.date ? datePx * 1.3 : 0)
  const timePx = fit(ctx, f.time, inner, (bottom - top) * 0.9, '600')
  ctx.fillStyle = p.text
  ctx.fillText(f.time, w / 2, (top + bottom) / 2 + timePx * 0.36)

  if (f.date) {
    fit(ctx, f.date, inner, datePx)
    ctx.fillStyle = p.muted
    ctx.fillText(f.date, w / 2, h - pad)
  }
}
