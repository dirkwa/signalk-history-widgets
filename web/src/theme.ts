// The card behind every widget: dark by default, light for a bright screen,
// or following the screen's light or dark setting. Night mode overrides all
// three with red on black.

export type Theme = 'dark' | 'light' | 'auto'

const THEME_CHOICES: readonly (readonly [Theme, string])[] = [
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['auto', 'Auto']
]

export function parseTheme(stored: unknown): Theme {
  return stored === 'light' || stored === 'auto' ? stored : 'dark'
}

export interface Palettes<P> {
  dark: P
  light: P
  night: P
}

export function paletteFor<P>(
  palettes: Palettes<P>,
  theme: Theme,
  night: boolean,
  screenLight: boolean
): P {
  if (night) return palettes.night
  return theme === 'light' || (theme === 'auto' && screenLight) ? palettes.light : palettes.dark
}

const RGBA = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/

/**
 * The palette with its card at the opacity the host's user chose for every
 * panel on the chart, or unchanged when they chose none.
 */
export function withPanelOpacity<P extends { card: string }>(
  palette: P,
  panelOpacity: number | null
): P {
  if (panelOpacity === null) return palette
  const m = RGBA.exec(palette.card)
  if (!m) return palette
  return { ...palette, card: `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${panelOpacity})` }
}

const LIGHT_SCREEN = '(prefers-color-scheme: light)'

export function screenIsLight(): boolean {
  return window.matchMedia(LIGHT_SCREEN).matches
}

/** Calls back when the screen switches between light and dark. */
export function followScreenScheme(onChange: () => void): void {
  window.matchMedia(LIGHT_SCREEN).addEventListener('change', onChange)
}

/** The touch buttons that pick the theme in a configuration panel. */
export function themeChips(current: Theme): string {
  return `<div class="chips">${THEME_CHOICES.map(
    ([value, label]) =>
      `<button type="button" class="chip${value === current ? ' on' : ''}" aria-pressed="${value === current}" data-theme="${value}">${label}</button>`
  ).join('')}</div>`
}

/** Makes the theme buttons exclusive. */
export function wireThemeChips(onPick?: (theme: Theme) => void): void {
  const chips = document.querySelectorAll<HTMLButtonElement>('[data-theme]')
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      for (const other of chips) {
        other.classList.toggle('on', other === chip)
        other.setAttribute('aria-pressed', String(other === chip))
      }
      onPick?.(parseTheme(chip.dataset.theme))
    })
  }
}

export function chosenTheme(): Theme {
  return parseTheme(document.querySelector<HTMLButtonElement>('[data-theme].on')?.dataset.theme)
}
