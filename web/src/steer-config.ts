// The wind steering widget's configuration panel. It reads and writes the
// configured instance's state; the widget redraws on state.changed.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import { CLOSE_HAULED_RANGE, parseSteerConfig, type SteerConfig } from './steer-model.js'
import './config.css'

type Toggle =
  'showTackLines' | 'showShift' | 'showWaypoint' | 'showCourse' | 'showCurrent' | 'showRudder'

const TOGGLES: readonly { key: Toggle; label: string }[] = [
  { key: 'showTackLines', label: 'Close-hauled lines for both tacks' },
  { key: 'showShift', label: 'Wind shift fan' },
  { key: 'showWaypoint', label: 'Next waypoint' },
  { key: 'showCourse', label: 'Course over ground' },
  { key: 'showCurrent', label: 'Current (set and drift)' },
  { key: 'showRudder', label: 'Rudder angle' }
]

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found
}

function field(id: string): HTMLInputElement | HTMLSelectElement {
  const found = el(id)
  if (found instanceof HTMLInputElement || found instanceof HTMLSelectElement) return found
  throw new Error(`#${id} is not a form field`)
}

function checkbox(id: string): HTMLInputElement {
  const found = el(id)
  if (found instanceof HTMLInputElement) return found
  throw new Error(`#${id} is not a checkbox`)
}

function select(id: string, options: [string, string][], value: string): string {
  return `<select id="${id}">${options
    .map(([v, label]) => `<option value="${v}"${v === value ? ' selected' : ''}>${label}</option>`)
    .join('')}</select>`
}

function form(c: SteerConfig): string {
  return `
    <label class="row"><span>Dial</span>
      ${select(
        'dial',
        [
          ['compass', 'Compass card, heading up'],
          ['wind', 'Wind angles, bow up']
        ],
        c.dial
      )}
    </label>
    <label class="row"><span>North</span>
      ${select(
        'north',
        [
          ['true', 'True'],
          ['magnetic', 'Magnetic']
        ],
        c.north
      )}
    </label>
    <label class="row"><span>True wind</span>
      ${select(
        'trueWind',
        [
          ['water', 'Through water'],
          ['ground', 'Over ground']
        ],
        c.trueWind
      )}
    </label>
    <label class="row"><span>Close-hauled</span>
      <input id="closeHauled" type="number" min="${CLOSE_HAULED_RANGE.min}" max="${CLOSE_HAULED_RANGE.max}" step="1" value="${c.closeHauled}">
    </label>
    <label class="row"><span>Shift window</span>
      <select id="shiftSeconds">
        ${[30, 60, 120, 300, 600, 1800]
          .map(
            (s) =>
              `<option value="${s}"${s === c.shiftSeconds ? ' selected' : ''}>${s < 60 ? `${s} s` : `${s / 60} min`}</option>`
          )
          .join('')}
        ${[30, 60, 120, 300, 600, 1800].includes(c.shiftSeconds) ? '' : `<option value="${c.shiftSeconds}" selected>${c.shiftSeconds} s</option>`}
      </select>
    </label>
    <div class="toggles">
      ${TOGGLES.map(
        (t) =>
          `<label class="toggle"><input type="checkbox" id="${t.key}"${c[t.key] ? ' checked' : ''}> ${t.label}</label>`
      ).join('')}
    </div>
    <p class="status">Close-hauled is the angle off the true wind you sail upwind, ${CLOSE_HAULED_RANGE.min} to ${CLOSE_HAULED_RANGE.max} degrees. Wind speeds use the unit set for apparent wind speed in the server's Unit Preferences.</p>
    <p class="status" id="status"></p>
    <div class="actions">
      <button type="button" id="cancel">Cancel</button>
      <button type="button" id="save" class="primary">Save</button>
    </div>`
}

function read(): Record<string, unknown> {
  const out: Record<string, unknown> = {
    dial: field('dial').value,
    north: field('north').value,
    trueWind: field('trueWind').value,
    closeHauled: Number(field('closeHauled').value),
    shiftSeconds: Number(field('shiftSeconds').value)
  }
  for (const t of TOGGLES) out[t.key] = checkbox(t.key).checked
  // Out-of-range numbers are clamped here rather than stored as typed.
  return { ...parseSteerConfig(out) }
}

async function main(): Promise<void> {
  const root = el('root')
  const client = await connectExtension()
  root.innerHTML = '<p class="status">Loading…</p>'
  root.innerHTML = form(parseSteerConfig(await client.state.get()))

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
