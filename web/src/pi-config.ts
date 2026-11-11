// The system health widget's configuration panel: storage is switched on or
// off with a tap; only the optional label needs a keyboard.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import { parsePiConfig } from './pi-model.js'
import { chosenTheme, themeChips, wireThemeChips } from './theme.js'
import './config.css'

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

async function main(): Promise<void> {
  const root = el('root')
  const client = await connectExtension()
  root.innerHTML = '<p class="status">Loading…</p>'
  const config = parsePiConfig(await client.state.get())
  let { showStorage } = config

  root.innerHTML = `
    <div class="section-title">Storage</div>
    <div class="chips">
      <button type="button" class="chip" data-storage="true">Show</button>
      <button type="button" class="chip" data-storage="false">Hide</button>
    </div>
    <div class="section-title">Background</div>
    ${themeChips(config.theme)}
    <label class="row"><span>Label</span>
      <input id="label" value="${esc(config.label)}" placeholder="System">
    </label>
    <p class="status">Readings come from signalk-rpi-stats. They turn yellow from 70 °C, 80 % CPU or RAM and 85 % storage, and red from 80 °C, 95 % CPU, 90 % RAM and 95 % storage, unless the path's metadata sets its own zones.</p>
    <p class="status" id="status"></p>
    <div class="actions">
      <button type="button" id="cancel">Cancel</button>
      <button type="button" id="save" class="primary">Save</button>
    </div>`

  const chips = root.querySelectorAll<HTMLButtonElement>('[data-storage]')
  const show = (): void => {
    for (const chip of chips) {
      const on = chip.dataset.storage === String(showStorage)
      chip.classList.toggle('on', on)
      chip.setAttribute('aria-pressed', String(on))
    }
  }
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      showStorage = chip.dataset.storage === 'true'
      show()
    })
  }
  show()
  wireThemeChips()

  el('save').addEventListener('click', () => {
    const input = el('label')
    const label = input instanceof HTMLInputElement ? input.value.trim() : ''
    client.state
      .set({ label, showStorage, theme: chosenTheme() })
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

main().catch((err: unknown) => {
  const root = document.getElementById('root')
  if (root)
    root.textContent = `Host connection failed: ${err instanceof Error ? err.message : String(err)}`
})
