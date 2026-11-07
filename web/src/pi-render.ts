// Draws the system health tile: the CPU temperature as large as the cell
// allows, then one bar each for CPU load, memory and, if chosen, storage.
// Every reading takes the colour of its zone; a power or heat problem the Pi
// reports replaces the title in red.

import type { Level } from './level-model.js'
import type { LevelPalette } from './level-render.js'

export interface PiBar {
  label: string
  /** 0..1, or undefined while no current reading is in. */
  fraction: number | undefined
  text: string
  level: Level
}

export interface PiFrame {
  title: string
  /** Shown in place of the title, in red. */
  warning: string | undefined
  temperature: { text: string; level: Level; known: boolean }
  bars: PiBar[]
  palette: LevelPalette
}

const FONT = "'Helvetica Neue', Arial, sans-serif"

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

function colourOf(p: LevelPalette, level: Level, known: boolean): string {
  if (!known) return p.muted
  return level === 'ok' ? p.text : p.mark[level]
}

export function drawPi(ctx: CanvasRenderingContext2D, w: number, h: number, f: PiFrame): void {
  const p = f.palette
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = p.card
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, Math.min(10, w / 10))
  ctx.fill()

  const pad = Math.max(5, Math.min(w, h) * 0.07)
  const inner = w - 2 * pad
  const titleSize = Math.max(9, h * 0.12)
  const rowH = (h - 2 * pad) * (f.bars.length > 2 ? 0.17 : 0.2)
  const barsTop = h - pad - rowH * f.bars.length

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = f.warning ? p.mark.alarm : p.muted
  const title = f.warning ?? f.title
  fitText(ctx, title, titleSize, inner, f.warning ? 'bold' : '')
  ctx.fillText(title, w / 2, pad)

  const tempTop = pad + titleSize * 1.15
  const tempSize = (barsTop - tempTop) * 0.9
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colourOf(p, f.temperature.level, f.temperature.known)
  fitText(ctx, f.temperature.text, tempSize, inner, 'bold')
  ctx.fillText(f.temperature.text, w / 2, (tempTop + barsTop) / 2 + tempSize * 0.04)

  const labelSize = rowH * 0.5
  ctx.font = `${labelSize}px ${FONT}`
  const labelW = Math.max(...f.bars.map((b) => ctx.measureText(b.label).width), 0)
  ctx.font = `bold ${labelSize}px ${FONT}`
  const valueW = ctx.measureText('100 %').width
  const gap = pad * 0.4
  const barLeft = pad + labelW + gap
  const barW = Math.max(4, inner - labelW - valueW - 2 * gap)
  const barH = Math.max(3, rowH * 0.42)

  for (const [i, b] of f.bars.entries()) {
    const mid = barsTop + rowH * (i + 0.5)
    ctx.textAlign = 'left'
    ctx.fillStyle = p.muted
    ctx.font = `${labelSize}px ${FONT}`
    ctx.fillText(b.label, pad, mid)

    ctx.fillStyle = p.glass
    ctx.beginPath()
    ctx.roundRect(barLeft, mid - barH / 2, barW, barH, barH / 2)
    ctx.fill()
    if (b.fraction !== undefined) {
      const filled = Math.max(barH, barW * Math.min(1, Math.max(0, b.fraction)))
      ctx.fillStyle = p.liquid[b.level].middle
      ctx.beginPath()
      ctx.roundRect(barLeft, mid - barH / 2, filled, barH, barH / 2)
      ctx.fill()
    }

    ctx.textAlign = 'right'
    ctx.fillStyle = colourOf(p, b.level, b.fraction !== undefined)
    fitText(ctx, b.text, labelSize, valueW, 'bold')
    ctx.fillText(b.text, w - pad, mid)
  }
}
