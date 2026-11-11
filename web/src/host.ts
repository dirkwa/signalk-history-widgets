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

/** How often the clock is checked for a pause, and the jump that counts as one. */
const RESUME_CHECK_MS = 5_000
const RESUME_GAP_MS = 15_000

/**
 * Whether the clock moved further between two checks than it can while the
 * page runs: the page was stopped in between, or the clock was set forward,
 * which leaves the same gap to fill.
 */
export function pausedBetween(lastCheck: number, now: number): boolean {
  return now - lastCheck > RESUME_GAP_MS
}

/**
 * Runs `reload` whenever the page runs again after it could not: shown again
 * after it was hidden, or going on after the whole browser was stopped. A
 * kiosk stops its browser (SIGSTOP) while the monitor is off; the page never
 * becomes hidden then, so no visibilitychange comes, and only the clock
 * having jumped between two checks gives the pause away. Timers of a hidden
 * page are throttled, so the clock is judged only while the page is visible.
 *
 * One reload runs at a time. A pause that ends while one is under way leaves
 * a gap of its own, so another reload follows.
 */
export function onResume(reload: () => Promise<void>): void {
  let running = false
  let again = false
  const resumed = () => {
    if (running) {
      again = true
      return
    }
    running = true
    void Promise.resolve()
      .then(reload)
      .catch(() => undefined)
      .finally(() => {
        running = false
        if (again) {
          again = false
          resumed()
        }
      })
  }
  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    lastCheck = Date.now()
    if (document.visibilityState === 'visible') resumed()
  })
  setInterval(() => {
    const now = Date.now()
    if (document.visibilityState === 'visible' && pausedBetween(lastCheck, now)) {
      resumed()
    }
    lastCheck = now
  }, RESUME_CHECK_MS)
}

/**
 * Follows the background opacity the user chose for every panel on the chart
 * (`display.panelOpacity`); null while they chose none or the host offers no
 * `display`, and the widget keeps its own.
 */
export async function followPanelOpacity(
  client: ExtensionClient,
  onChange: (panelOpacity: number | null) => void
): Promise<void> {
  if (!client.hasCapability('display')) return
  await client.subscribe(['display.changed'], (_name, params) => {
    onChange(parsePanelOpacity(params))
  })
  onChange(parsePanelOpacity(await client.call('display.get')))
}

export function parsePanelOpacity(params: unknown): number | null {
  const v = (params as { panelOpacity?: unknown } | undefined)?.panelOpacity
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : null
}
