// The depth profile's configuration panel: which depth and how far back, all
// as buttons, so it is set up by touch without a keyboard.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import {
  DEPTH_PATHS,
  DEPTH_WINDOWS,
  depthPath,
  parseDepthConfig,
  windowLabel
} from './depth-model.js'
import { fetchMeta, fetchValue } from './signalk.js'
import { convert, resolveDisplay } from './units.js'
import './config.css'

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found
}

/** Each depth's current reading as shown, or undefined when it has none. */
async function readings(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  await Promise.all(
    DEPTH_PATHS.map(async (d) => {
      const [value, meta] = await Promise.all([fetchValue(d.path), fetchMeta(d.path)])
      if (typeof value !== 'number' || !Number.isFinite(value)) return
      const display = resolveDisplay({ ...meta, units: meta?.units ?? 'm' }, undefined, -1)
      out.set(
        d.path,
        `${convert(value, display.conversion).toFixed(display.decimals)} ${display.symbol}`
      )
    })
  )
  return out
}

async function main(): Promise<void> {
  const root = el('root')
  const client = await connectExtension()
  root.innerHTML = '<p class="status">Loading…</p>'
  const [stored, shown] = await Promise.all([client.state.get(), readings()])
  const config = parseDepthConfig(stored)
  const auto = depthPath({ ...config, path: '' }, new Set(shown.keys()))
  const autoLabel = DEPTH_PATHS.find((d) => d.path === auto)?.label.toLowerCase() ?? ''

  const draw = (): void => {
    const depthChips = [
      { path: '', label: `Automatic (${autoLabel})` },
      ...DEPTH_PATHS.map((d) => ({
        path: d.path,
        label: `${d.label} ${shown.get(d.path) ?? '(none)'}`
      }))
    ]
    root.innerHTML = `
      <div class="row"><span>Depth</span><div class="chips">${depthChips
        .map(
          (c, i) =>
            `<button type="button" class="chip${c.path === config.path ? ' on' : ''}" data-depth="${i}">${c.label}</button>`
        )
        .join('')}</div></div>
      <div class="row"><span>Window</span><div class="chips">${DEPTH_WINDOWS.map(
        (m) =>
          `<button type="button" class="chip${m === config.minutes ? ' on' : ''}" data-minutes="${m}">${windowLabel(m)}</button>`
      ).join('')}</div></div>
      <p class="status">Automatic follows the depth below the surface when the server has it, else below the transducer or the keel.</p>
      <p class="status" id="status"></p>
      <div class="actions">
        <button type="button" id="cancel">Cancel</button>
        <button type="button" id="save" class="primary">Save</button>
      </div>`
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-depth]')) {
      b.addEventListener('click', () => {
        config.path = depthChips[Number(b.dataset.depth)]?.path ?? ''
        draw()
      })
    }
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-minutes]')) {
      b.addEventListener('click', () => {
        config.minutes = Number(b.dataset.minutes)
        draw()
      })
    }
    el('save').addEventListener('click', () => {
      client.state
        .set({ ...config })
        .then(() => client.call('ui.closePanel'))
        .catch((err: unknown) => {
          el('status').textContent =
            `Save failed: ${err instanceof Error ? err.message : String(err)}`
        })
    })
    el('cancel').addEventListener('click', () => {
      client.call('ui.closePanel').catch(() => undefined)
    })
  }
  draw()
}

main().catch((err: unknown) => {
  const root = document.getElementById('root')
  if (root)
    root.textContent = `Host connection failed: ${err instanceof Error ? err.message : String(err)}`
})
