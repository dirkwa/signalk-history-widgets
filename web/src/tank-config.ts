// The tank widget's configuration panel, made for a touchscreen: the tank is
// picked by tapping it in a list that shows each tank's current level, and
// the volume is a switch. Only the optional label needs a keyboard.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import { fetchNumericPaths, type PathInfo } from './signalk.js'
import { isTankLevel, parseTankConfig, tankName } from './tank-model.js'
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

function pickButton(p: PathInfo, selected: string): string {
  const name = isTankLevel(p.path) ? (p.displayName ?? tankName(p.path)) : p.path
  return `<button type="button" class="pick${p.path === selected ? ' on' : ''}" data-path="${esc(p.path)}" title="${esc(p.path)}">
      <span class="name">${esc(name)}</span>
      <span class="reading">${Math.round(p.value * 100)} %</span>
    </button>`
}

function section(title: string, paths: PathInfo[], selected: string): string {
  if (paths.length === 0) return ''
  return `<div class="section-title">${title}</div>
    <div class="picks">${paths.map((p) => pickButton(p, selected)).join('')}</div>`
}

async function main(): Promise<void> {
  const root = el('root')
  const client = await connectExtension()
  root.innerHTML = '<p class="status">Loading…</p>'
  const [stored, paths] = await Promise.all([client.state.get(), fetchNumericPaths()])
  const config = parseTankConfig(stored)
  // Any other 0..1 value (a battery's state of charge, say) fills a tank too.
  const ratios = paths.filter((p) => p.units === 'ratio' || isTankLevel(p.path))
  const tanks = ratios.filter((p) => isTankLevel(p.path))
  const others = ratios.filter((p) => !isTankLevel(p.path))
  let selected = config.path
  let showVolume = config.showVolume

  root.innerHTML = `
    ${section('Tanks', tanks, selected)}
    ${section('Other levels', others, selected)}
    ${ratios.length === 0 ? '<p class="status">No tank levels on this server yet.</p>' : ''}
    <label class="row"><span>Label</span>
      <input id="label" value="${esc(config.label)}" placeholder="Automatic">
    </label>
    <div class="section-title">Volume left (needs the tank's capacity)</div>
    <div class="chips">
      <button type="button" class="chip${showVolume ? ' on' : ''}" data-volume="true">Show</button>
      <button type="button" class="chip${showVolume ? '' : ' on'}" data-volume="false">Hide</button>
    </div>
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
        other.classList.toggle('on', other === pick)
      }
    })
  }
  for (const chip of document.querySelectorAll<HTMLButtonElement>('[data-volume]')) {
    chip.addEventListener('click', () => {
      showVolume = chip.dataset.volume === 'true'
      for (const other of document.querySelectorAll<HTMLButtonElement>('[data-volume]')) {
        other.classList.toggle('on', other === chip)
      }
    })
  }

  const status = el('status')
  el('save').addEventListener('click', () => {
    client.state
      .set({ path: selected, label: textInput('label').value.trim(), showVolume })
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
