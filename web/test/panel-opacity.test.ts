import { describe, expect, it, vi } from 'vitest'
import type { ExtensionClient } from 'signalk-plotterext-bus/extension'
import { followPanelOpacity, parsePanelOpacity } from '../src/host.js'

type Listener = (name: string, params: unknown) => void

function fakeHost(capable: boolean, panelOpacity: unknown) {
  let listener: Listener | undefined
  const client = {
    hasCapability: (id: string) => capable && id === 'display',
    subscribe: vi.fn((_patterns: string[], cb: Listener) => {
      listener = cb
      return Promise.resolve(() => Promise.resolve())
    }),
    call: vi.fn(() => Promise.resolve({ panelOpacity }))
  }
  return {
    client: client as unknown as ExtensionClient,
    call: client.call,
    emit: (params: unknown) => listener?.('display.changed', params)
  }
}

describe('parsePanelOpacity', () => {
  it('takes an opacity from 0 to 1', () => {
    expect(parsePanelOpacity({ panelOpacity: 0.7 })).toBe(0.7)
    expect(parsePanelOpacity({ panelOpacity: 1 })).toBe(1)
  })

  it('is null when the user chose none or the value is unusable', () => {
    expect(parsePanelOpacity({ panelOpacity: null })).toBeNull()
    expect(parsePanelOpacity({ panelOpacity: 1.5 })).toBeNull()
    expect(parsePanelOpacity({ panelOpacity: '0.5' })).toBeNull()
    expect(parsePanelOpacity(undefined)).toBeNull()
  })
})

describe('followPanelOpacity', () => {
  it('reads the opacity and follows its changes', async () => {
    const host = fakeHost(true, 0.85)
    const seen: (number | null)[] = []
    await followPanelOpacity(host.client, (o) => seen.push(o))
    host.emit({ panelOpacity: null })
    expect(host.call).toHaveBeenCalledWith('display.get')
    expect(seen).toEqual([0.85, null])
  })

  it('leaves the widget alone when the host offers no display', async () => {
    const host = fakeHost(false, 0.5)
    const onChange = vi.fn()
    await followPanelOpacity(host.client, onChange)
    expect(host.call).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})
