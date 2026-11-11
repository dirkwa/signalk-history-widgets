// The clock's configuration panel: every choice is a button, so it is set up
// by touch. Only the optional label needs a keyboard.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import {
  BoatZoneReadings,
  CLOCK_PATHS,
  clockText,
  clockTitle,
  parseClockConfig,
  type ClockConfig
} from './clock-model.js'
import { fetchValue } from './signalk.js'
import { themeChips, wireThemeChips } from './theme.js'
import './config.css'

type Choice<K extends keyof ClockConfig> = {
  key: K
  title: string
  options: readonly [ClockConfig[K], string][]
}

const CHOICES = [
  {
    key: 'zone',
    title: 'Time zone',
    options: [
      ['local', 'This screen'],
      ['utc', 'UTC'],
      ['boat', 'Boat']
    ]
  } satisfies Choice<'zone'>,
  {
    key: 'hours',
    title: 'Hours',
    options: [
      ['24', '24 h'],
      ['12', '12 h']
    ]
  } satisfies Choice<'hours'>,
  {
    key: 'seconds',
    title: 'Seconds',
    options: [
      [true, 'Show'],
      [false, 'Hide']
    ]
  } satisfies Choice<'seconds'>,
  {
    key: 'showDate',
    title: 'Date',
    options: [
      [true, 'Show'],
      [false, 'Hide']
    ]
  } satisfies Choice<'showDate'>
] as const

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id}`)
  return found
}

function labelText(): string {
  const input = el('label')
  return input instanceof HTMLInputElement ? input.value.trim() : ''
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
}

async function main(): Promise<void> {
  const root = el('root')
  const client = await connectExtension()
  root.innerHTML = '<p class="status">Loading…</p>'
  const config = parseClockConfig(await client.state.get())
  const zone = new BoatZoneReadings()

  const preview = (): string => {
    const shown = { ...config, label: labelText() }
    const t = clockText(Date.now(), shown, zone.zone())
    const date = config.showDate ? `, ${esc(t.date)}` : ''
    return `${esc(clockTitle(shown, t))}: ${esc(t.time)}${date}`
  }
  const updatePreview = (): void => {
    el('preview').innerHTML = preview()
  }

  const draw = (): void => {
    root.innerHTML = `
      ${CHOICES.map(
        (c) => `
        <div class="row"><span>${c.title}</span><div class="chips">${c.options
          .map(
            ([value, label], i) =>
              `<button type="button" class="chip${config[c.key] === value ? ' on' : ''}" data-key="${c.key}" data-index="${i}">${label}</button>`
          )
          .join('')}</div></div>`
      ).join('')}
      <div class="row"><span>Background</span>${themeChips(config.theme)}</div>
      <label class="row"><span>Label</span>
        <input id="label" type="text" placeholder="Automatic" value="${esc(config.label)}">
      </label>
      <p class="status" id="preview"></p>
      <p class="status">Boat is the zone set on the server, the same on every screen.</p>
      <p class="status" id="status"></p>
      <div class="actions">
        <button type="button" id="cancel">Cancel</button>
        <button type="button" id="save" class="primary">Save</button>
      </div>`
    updatePreview()
    el('label').addEventListener('input', updatePreview)
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-key]')) {
      button.addEventListener('click', () => {
        const choice = CHOICES.find((c) => c.key === button.dataset.key)
        const option = choice?.options[Number(button.dataset.index)]
        if (!choice || !option) return
        Object.assign(config, { [choice.key]: option[0] })
        config.label = labelText()
        draw()
      })
    }
    wireThemeChips((theme) => {
      config.theme = theme
    })
    el('save').addEventListener('click', () => {
      config.label = labelText()
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
  // The panel's page goes away when the host closes it; pagehide stops the
  // refresh for a host that keeps the page around.
  const refresh = setInterval(updatePreview, 1000)
  window.addEventListener('pagehide', () => {
    clearInterval(refresh)
  })
  // The boat zone only feeds the preview, so the panel never waits for it.
  for (const path of [CLOCK_PATHS.region, CLOCK_PATHS.offset]) {
    void fetchValue(path).then((value) => {
      zone.stored(path, value)
      updatePreview()
    })
  }
}

main().catch((err: unknown) => {
  const root = document.getElementById('root')
  if (root)
    root.textContent = `Host connection failed: ${err instanceof Error ? err.message : String(err)}`
})
