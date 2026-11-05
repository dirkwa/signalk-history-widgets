// The configuration panel. The host opens it for one widget instance
// (context.targetInstance); state.get/set then read and write that
// instance's settings, and the widget redraws on the state.changed event.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import {
  COMMON_PATHS,
  parseConfig,
  spanChoices,
  windowMs,
  type StripConfig
} from './config-model.js'
import { fetchHistoryProviders, fetchNumericPaths, type PathInfo } from './signalk.js'
import { CONVERSIONS } from './units.js'
import './config.css'

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found
}

function input(id: string): HTMLInputElement | HTMLSelectElement {
  const found = el(id)
  if (found instanceof HTMLInputElement || found instanceof HTMLSelectElement) return found
  throw new Error(`#${id} is not a form field`)
}

function form(config: StripConfig, paths: PathInfo[], providers: string[]): string {
  const common = COMMON_PATHS.map(
    (p) =>
      `<button type="button" class="chip${p.path === config.path ? ' on' : ''}" data-path="${p.path}" title="${esc(p.title)}">${p.label}</button>`
  ).join('')
  const history =
    providers.length > 0
      ? `History from ${esc(providers.join(', '))}: the strip fills at once.`
      : 'No history provider on the server: the strip fills from live data. Install one (for example KIP, signalk-parquet or signalk-to-influxdb2) to see the past window at once.'
  return `
    <div class="chips">${common}</div>
    <label class="row"><span>Signal K path</span>
      <input id="path" list="paths" value="${esc(config.path)}" placeholder="Type to search…">
      <datalist id="paths">${paths.map((p) => `<option value="${esc(p.path)}">`).join('')}</datalist>
    </label>
    <label class="row"><span>Label</span>
      <input id="label" value="${esc(config.label)}" placeholder="Automatic">
    </label>
    <div class="row"><span id="span-title">Time span</span>
      <div class="chips" role="group" aria-labelledby="span-title">${spanChoices(config)
        .map(
          (c) =>
            `<button type="button" class="chip${windowMs({ ...config, ...c }) === windowMs(config) ? ' on' : ''}" aria-pressed="${windowMs({ ...config, ...c }) === windowMs(config)}" data-span="${c.span}" data-span-unit="${c.spanUnit}">${c.label}</button>`
        )
        .join('')}</div>
    </div>
    <label class="row"><span>Units</span><select id="unit"></select></label>
    <label class="row"><span>Decimals</span>
      <select id="decimals">
        ${[-1, 0, 1, 2, 3]
          .map(
            (d) =>
              `<option value="${d}"${d === config.decimals ? ' selected' : ''}>${d < 0 ? 'Automatic' : d}</option>`
          )
          .join('')}
      </select>
    </label>
    <p class="status">${history}</p>
    <p class="status" id="status"></p>
    <div class="actions">
      <button type="button" id="cancel">Cancel</button>
      <button type="button" id="save" class="primary">Save</button>
    </div>`
}

function fillUnits(paths: PathInfo[], selected: string): void {
  const path = input('path').value.trim()
  const units = paths.find((p) => p.path === path)?.units
  const options = units ? (CONVERSIONS[units] ?? []) : []
  const keep = options.some((o) => o.id === selected) ? selected : ''
  el('unit').innerHTML = [
    `<option value=""${keep === '' ? ' selected' : ''}>Server default</option>`,
    ...options
      .filter((o, i, all) => all.findIndex((x) => x.symbol === o.symbol) === i)
      .map(
        (o) =>
          `<option value="${o.id}"${o.id === keep ? ' selected' : ''}>${esc(o.symbol || o.id)}</option>`
      )
  ].join('')
}

function read(): Record<string, unknown> {
  const span = document.querySelector<HTMLButtonElement>('[data-span].on')
  return {
    path: input('path').value.trim(),
    label: input('label').value.trim(),
    span: Number(span?.dataset.span),
    spanUnit: span?.dataset.spanUnit,
    unit: input('unit').value,
    decimals: Number(input('decimals').value)
  }
}

async function main(): Promise<void> {
  const root = el('root')
  const client = await connectExtension()
  root.innerHTML = '<p class="status">Loading…</p>'
  const [stored, paths, providers] = await Promise.all([
    client.state.get(),
    fetchNumericPaths(),
    fetchHistoryProviders()
  ])
  const config = parseConfig(stored)
  root.innerHTML = form(config, paths, providers)
  fillUnits(paths, config.unit)

  const pathInput = input('path')
  const onPath = () => {
    fillUnits(paths, input('unit').value)
    for (const chip of document.querySelectorAll<HTMLButtonElement>('[data-path]')) {
      chip.classList.toggle('on', chip.dataset.path === pathInput.value.trim())
    }
  }
  pathInput.addEventListener('change', onPath)
  pathInput.addEventListener('input', onPath)
  for (const chip of document.querySelectorAll<HTMLButtonElement>('[data-path]')) {
    chip.addEventListener('click', () => {
      pathInput.value = chip.dataset.path ?? ''
      onPath()
    })
  }
  const spans = document.querySelectorAll<HTMLButtonElement>('[data-span]')
  for (const chip of spans) {
    chip.addEventListener('click', () => {
      for (const other of spans) {
        other.classList.toggle('on', other === chip)
        other.setAttribute('aria-pressed', String(other === chip))
      }
    })
  }

  const status = el('status')
  el('save').addEventListener('click', () => {
    client.state
      .set(read())
      .then(() => client.call('ui.closePanel'))
      .catch((err: unknown) => {
        status.textContent = `Save failed: ${err instanceof Error ? err.message : String(err)}`
      })
  })
  el('cancel').addEventListener('click', () => {
    client.call('ui.closePanel').catch(() => undefined)
  })
}

main().catch((err: unknown) => {
  const root = document.getElementById('root')
  if (root)
    root.textContent = `Host connection failed: ${err instanceof Error ? err.message : String(err)}`
})
