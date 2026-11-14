import { describe, expect, it } from 'vitest'
import { paletteFor, parseTheme, withPanelOpacity } from '../src/theme.js'

const PALETTES = { dark: 'dark', light: 'light', night: 'night' }

describe('parseTheme', () => {
  it('keeps a known theme and falls back to dark', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('auto')).toBe('auto')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme(undefined)).toBe('dark')
    expect(parseTheme('sepia')).toBe('dark')
  })
})

describe('paletteFor', () => {
  it('draws a fixed theme whatever the screen says', () => {
    expect(paletteFor(PALETTES, 'dark', false, true)).toBe('dark')
    expect(paletteFor(PALETTES, 'light', false, false)).toBe('light')
  })

  it('follows the screen on auto', () => {
    expect(paletteFor(PALETTES, 'auto', false, true)).toBe('light')
    expect(paletteFor(PALETTES, 'auto', false, false)).toBe('dark')
  })

  it('lets night mode override every theme', () => {
    for (const theme of ['dark', 'light', 'auto'] as const) {
      expect(paletteFor(PALETTES, theme, true, true)).toBe('night')
    }
  })
})

describe('withPanelOpacity', () => {
  const palette = { card: 'rgba(20, 26, 32, 0.78)', text: '#fff' }

  it('keeps the card when the user chose no panel opacity', () => {
    expect(withPanelOpacity(palette, null)).toBe(palette)
  })

  it('draws the card at the chosen opacity and leaves the rest', () => {
    expect(withPanelOpacity(palette, 1)).toEqual({ card: 'rgba(20, 26, 32, 1)', text: '#fff' })
    expect(withPanelOpacity(palette, 0.5).card).toBe('rgba(20, 26, 32, 0.5)')
  })
})
