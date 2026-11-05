// Host affordances every widget of this plugin shares.

import type { ExtensionClient } from 'signalk-plotterext-bus/extension'

const LONG_PRESS_MS = 1500

/** Press and hold anywhere on the widget opens its configuration panel. */
export function installLongPress(client: ExtensionClient): void {
  let pressTimer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    if (pressTimer) clearTimeout(pressTimer)
    pressTimer = undefined
  }
  window.addEventListener('pointerdown', () => {
    cancel()
    pressTimer = setTimeout(() => {
      client.call('ui.openConfigPanel').catch(() => undefined)
    }, LONG_PRESS_MS)
  })
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    window.addEventListener(type, cancel)
  }
}

/** Reports the host's night mode now and on every change. */
export async function followNightMode(
  client: ExtensionClient,
  onChange: (enabled: boolean) => void
): Promise<void> {
  if (!client.hasCapability('nightMode')) return
  await client.subscribe(['nightMode.changed'], (_name, params) => {
    onChange((params as { enabled?: unknown } | undefined)?.enabled === true)
  })
  onChange((await client.nightMode.get()).enabled)
}
