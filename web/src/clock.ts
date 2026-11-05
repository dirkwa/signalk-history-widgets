// The clock widget: the time in this screen's zone, UTC or the boat's zone
// as the server reports it, kept to GPS time when the screen's own clock is
// off. Settings come from the instance state the configuration panel writes.

import { connectExtension, type ExtensionClient } from 'signalk-plotterext-bus/extension'
import { installLongPress, followNightMode } from './host.js'
import {
  CLOCK_PATHS,
  boatZone,
  GpsClock,
  clockText,
  parseClockConfig,
  type ClockConfig
} from './clock-model.js'
import { CLOCK_DAY, CLOCK_NIGHT, drawClock } from './clock-render.js'
import { fetchValue } from './signalk.js'
import './styles.css'

const canvas = document.createElement('canvas')
document.getElementById('root')?.append(canvas)
let config: ClockConfig = parseClockConfig({})
let night = false
const gps = new GpsClock()
let region: unknown
let offset: unknown
let drawQueued = false

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
  const text = clockText(Date.now() + gps.correction, config, boatZone(region, offset))
  drawClock(ctx, rect.width, rect.height, {
    title: config.label || text.zoneName,
    time: text.time,
    date: config.showDate ? text.date : '',
    palette: night ? CLOCK_NIGHT : CLOCK_DAY
  })
}

function queueRender(): void {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(render)
}

/** Redraws just after each second turns, so the display never lags a tick. */
function tick(): void {
  queueRender()
  const now = Date.now() + gps.correction
  setTimeout(tick, 1000 - (now % 1000) + 20)
}

async function main(client: ExtensionClient): Promise<void> {
  installLongPress(client)
  new ResizeObserver(queueRender).observe(canvas)
  await client.subscribe(['state.changed'], () => {
    client.state
      .get()
      .then((stored) => {
        config = parseClockConfig(stored)
        queueRender()
      })
      .catch((err: unknown) => {
        console.warn('clock: settings reload failed', err)
      })
  })
  await followNightMode(client, (enabled) => {
    night = enabled
    queueRender()
  }).catch((err: unknown) => {
    console.warn('clock: night mode unavailable', err)
  })
  // The stream carries changes only, and the boat's zone rarely changes, so
  // its current value is read once; GPS time is only taken live, since a
  // stored reading is old by the time it is read.
  ;[config, region, offset] = await Promise.all([
    client.state.get().then(parseClockConfig),
    fetchValue(CLOCK_PATHS.region),
    fetchValue(CLOCK_PATHS.offset)
  ])
  tick()
  await client.signalk.subscribe(Object.values(CLOCK_PATHS), (ev) => {
    if (ev.path === CLOCK_PATHS.gpsTime) {
      gps.read(Date.now(), ev.value)
    } else if (ev.path === CLOCK_PATHS.region) {
      region = ev.value
    } else {
      offset = ev.value
    }
    queueRender()
  })
}

connectExtension()
  .then(main)
  .catch((err: unknown) => {
    console.warn('clock: host connection failed', err)
  })
