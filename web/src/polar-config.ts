// The polar performance widget's configuration panel: source, averaging and
// the detail line are chosen with a tap; only the optional label needs a
// keyboard.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import { AVERAGE_CHOICES, SOURCES, parsePolarConfig, type PolarSource } from './polar-model.js'
import './config.css'

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

const SOURCE_IDS = Object.keys(SOURCES) as PolarSource[]

/** One row of tap buttons; `pick` stores the choice, `isOn` lights it. */
function chipRow<T>(
  root: HTMLElement,
  name: string,
  values: readonly T[],
  pick: (v: T) => void,
  isOn: (v: T) => boolean
): () => void {
  const chips = [...root.querySelectorAll<HTMLButtonElement>(`[data-${name}]`)]
  const show = (): void => {
    for (const [i, chip] of chips.entries()) {
      const value = values[i]
      const on = value !== undefined && isOn(value)
      chip.classList.toggle('on', on)
      chip.setAttribute('aria-pressed', String(on))
    }
  }
  for (const [i, chip] of chips.entries()) {
    chip.addEventListener('click', () => {
      const value = values[i]
      if (value !== undefined) pick(value)
      show()
    })
  }
  show()
  return show
}

async function main(): Promise<void> {
  const root = el('root')
  const client = await connectExtension()
  root.innerHTML = '<p class="status">Loading…</p>'
  const config = parsePolarConfig(await client.state.get())
  let { source, averageSeconds, showDetail } = config

  root.innerHTML = `
    <div class="section-title">Compare</div>
    <div class="chips">
      ${SOURCE_IDS.map((id) => `<button type="button" class="chip" data-source>${SOURCES[id].choice}</button>`).join('')}
    </div>
    <div class="section-title">Average over</div>
    <div class="chips">
      ${AVERAGE_CHOICES.map((s) => `<button type="button" class="chip" data-average>${s} s</button>`).join('')}
    </div>
    <div class="section-title">Speeds under the percentage</div>
    <div class="chips">
      <button type="button" class="chip" data-detail>Show</button>
      <button type="button" class="chip" data-detail>Hide</button>
    </div>
    <label class="row"><span>Label</span>
      <input id="label" value="${esc(config.label)}" placeholder="${esc(SOURCES[source].title)}">
    </label>
    <p class="status">The percentage comes from Polar Performance (signalk-polar-performance-plugin), which compares the boat with the polar chosen in Polar Management. It turns yellow below 80 %, unless the path's metadata sets its own zones.</p>
    <p class="status" id="status"></p>
    <div class="actions">
      <button type="button" id="cancel">Cancel</button>
      <button type="button" id="save" class="primary">Save</button>
    </div>`

  chipRow(
    root,
    'source',
    SOURCE_IDS,
    (v) => (source = v),
    (v) => v === source
  )
  chipRow(
    root,
    'average',
    AVERAGE_CHOICES,
    (v) => (averageSeconds = v),
    (v) => v === averageSeconds
  )
  chipRow(
    root,
    'detail',
    [true, false],
    (v) => (showDetail = v),
    (v) => v === showDetail
  )

  el('save').addEventListener('click', () => {
    const input = el('label')
    const label = input instanceof HTMLInputElement ? input.value.trim() : ''
    client.state
      .set({ source, averageSeconds, showDetail, label })
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
