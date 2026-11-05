// The fill-level widgets' configuration panel, made for a touchscreen: the
// tank or battery bank is picked by tapping it in a list that shows each
// one's current level, and the look and the detail line are switches. Only
// the optional label needs a keyboard. The page's entry module picks the kind.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import { fetchNumericPaths, type PathInfo } from './signalk.js'
import { KINDS, parseLevelConfig, type KindSpec, type LevelKind } from './level-model.js'
import { convert, resolveDisplay } from './units.js'
import './config.css'

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found
}

function textInput(id: string): HTMLInputElement {
  const found = el(id)
  if (found instanceof HTMLInputElement) return found
  throw new Error(`#${id} is not an input`)
}

const PERCENT = resolveDisplay({ units: 'ratio' }, 'percent', 0)

function pickButton(spec: KindSpec, p: PathInfo, selected: string): string {
  const name = spec.matches(p.path) ? p.displayName || spec.name(p.path) : p.path
  return `<button type="button" class="pick${p.path === selected ? ' on' : ''}" aria-pressed="${p.path === selected}" data-path="${esc(p.path)}" title="${esc(p.path)}">
      <span class="name">${esc(name)}</span>
      <span class="reading">${convert(p.value, PERCENT.conversion).toFixed(PERCENT.decimals)} ${PERCENT.symbol}</span>
    </button>`
}

function section(spec: KindSpec, title: string, paths: PathInfo[], selected: string): string {
  if (paths.length === 0) return ''
  return `<div class="section-title">${title}</div>
    <div class="picks">${paths.map((p) => pickButton(spec, p, selected)).join('')}</div>`
}

/** Marks a button as the chosen one, for the eye and for screen readers. */
function press(button: HTMLButtonElement, on: boolean): void {
  button.classList.toggle('on', on)
  button.setAttribute('aria-pressed', String(on))
}

/** A row of chips of which exactly one is on; `name` groups them. */
function choice(name: string, options: [string, string][], value: string): string {
  return `<div class="chips">${options
    .map(
      ([v, label]) =>
        `<button type="button" class="chip${v === value ? ' on' : ''}" aria-pressed="${v === value}" data-${name}="${v}">${label}</button>`
    )
    .join('')}</div>`
}

/** Wires a chip row: tapping one turns the others off and reports its value. */
function onChoice(name: string, pick: (value: string) => void): void {
  const chips = document.querySelectorAll<HTMLButtonElement>(`[data-${name}]`)
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      for (const other of chips) press(other, other === chip)
      pick(chip.dataset[name] ?? '')
    })
  }
}

async function main(kind: LevelKind): Promise<void> {
  const spec = KINDS[kind]
  const root = el('root')
  const client = await connectExtension()
  root.innerHTML = '<p class="status">Loading…</p>'
  const [stored, paths] = await Promise.all([client.state.get(), fetchNumericPaths()])
  const config = parseLevelConfig(stored)
  // Any other 0..1 value fills the bar too.
  const ratios = paths.filter((p) => p.units === 'ratio' || spec.matches(p.path))
  const own = ratios.filter((p) => spec.matches(p.path))
  const others = ratios.filter((p) => !spec.matches(p.path))
  let { path: selected, style, showDetail } = config

  root.innerHTML = `
    ${section(spec, spec.plural, own, selected)}
    ${section(spec, 'Other levels', others, selected)}
    ${ratios.length === 0 ? '<p class="status">No levels on this server yet.</p>' : ''}
    <label class="row"><span>Label</span>
      <input id="label" value="${esc(config.label)}" placeholder="Automatic">
    </label>
    <div class="section-title">Look</div>
    ${choice(
      'look',
      [
        ['3d', '3D'],
        ['flat', 'Flat']
      ],
      style
    )}
    <div class="section-title">${spec.detailTitle}</div>
    ${choice(
      'detail',
      [
        ['true', 'Show'],
        ['false', 'Hide']
      ],
      String(showDetail)
    )}
    <p class="status">Colours follow the zones set for the path in the server's metadata: green when normal, yellow for alert and warn, red for alarm and emergency.</p>
    <p class="status" id="status"></p>
    <div class="actions sticky">
      <button type="button" id="cancel">Cancel</button>
      <button type="button" id="save" class="primary">Save</button>
    </div>`

  for (const pick of document.querySelectorAll<HTMLButtonElement>('.pick')) {
    pick.addEventListener('click', () => {
      selected = pick.dataset.path ?? ''
      for (const other of document.querySelectorAll<HTMLButtonElement>('.pick')) {
        press(other, other === pick)
      }
    })
  }
  onChoice('look', (v) => {
    style = v === 'flat' ? 'flat' : '3d'
  })
  onChoice('detail', (v) => {
    showDetail = v === 'true'
  })

  const status = el('status')
  el('save').addEventListener('click', () => {
    client.state
      .set({ path: selected, label: textInput('label').value.trim(), style, showDetail })
      .then(() => client.call('ui.closePanel'))
      .catch((err: unknown) => {
        status.textContent = `Save failed: ${err instanceof Error ? err.message : String(err)}`
      })
  })
  el('cancel').addEventListener('click', () => {
    client.call('ui.closePanel').catch(() => undefined)
  })
}

export function startLevelConfig(kind: LevelKind): void {
  main(kind).catch((err: unknown) => {
    const root = document.getElementById('root')
    if (root)
      root.textContent = `Host connection failed: ${err instanceof Error ? err.message : String(err)}`
  })
}
