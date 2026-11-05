import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ResourceProvider, ServerAPI } from '@signalk/server-api'
import historyWidgets from '../src/index.js'
import { loadAssets } from '../src/assets.js'
import { ASSET_BASE, PLUGIN_ID, buildManifest } from '../src/manifest.js'

type Handler = (
  req: { path: string; method: string },
  res: { type: (t: string) => { send: (b: Buffer) => void } },
  next: () => void
) => void

function fakeApp() {
  const providers: ResourceProvider[] = []
  const routes = new Map<string, Handler>()
  const app = {
    registerResourceProvider: (p: ResourceProvider) => providers.push(p),
    use: (path: string, handler: Handler) => routes.set(path, handler),
    setPluginStatus: vi.fn(),
    setPluginError: vi.fn()
  }
  return { app: app as unknown as ServerAPI, providers, routes }
}

describe('manifest', () => {
  it('offers a tall and a wide strip, the wind steering dial, a tank and a battery', () => {
    const m = buildManifest('1.0.0')
    expect(m.apiVersion).toBe('1')
    expect(m.widgets.map((w) => [w.id, w.size, w.configPanel])).toEqual([
      ['strip', '1x2', 'strip-config'],
      ['strip-wide', '2x2', 'strip-config'],
      ['wind-steering', '2x2', 'wind-steering-config'],
      ['tank', '1x2', 'tank-config'],
      ['battery', '1x2', 'battery-config']
    ])
    for (const w of m.widgets) {
      expect(w.url.startsWith(`${ASSET_BASE}/`)).toBe(true)
      expect(m.panels.map((p) => p.id)).toContain(w.configPanel)
    }
  })
})

describe('plugin', () => {
  it('lists its manifest only while running', async () => {
    const { app, providers } = fakeApp()
    const plugin = historyWidgets(app)
    plugin.start({}, () => undefined)
    expect(providers).toHaveLength(1)
    const provider = providers[0]
    if (!provider) return
    expect(provider.type).toBe('plotterExtensions')
    expect(Object.keys(await provider.methods.listResources({}))).toEqual([PLUGIN_ID])
    await plugin.stop()
    expect(await provider.methods.listResources({})).toEqual({})
    await expect(provider.methods.getResource(PLUGIN_ID)).rejects.toThrow()
  })

  it('registers once across restarts', async () => {
    const { app, providers, routes } = fakeApp()
    const plugin = historyWidgets(app)
    plugin.start({}, () => undefined)
    await plugin.stop()
    plugin.start({}, () => undefined)
    expect(providers).toHaveLength(1)
    expect(routes.size).toBe(1)
  })
})

describe('loadAssets', () => {
  it('maps every file under the directory to its URL path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'assets-'))
    await mkdir(join(dir, 'assets'))
    await writeFile(join(dir, 'widget.html'), '<html>')
    await writeFile(join(dir, 'assets', 'widget.js'), 'x')
    const assets = await loadAssets(dir)
    expect([...assets.keys()].sort()).toEqual(['/assets/widget.js', '/widget.html'])
    expect(assets.get('/widget.html')?.type).toContain('text/html')
    expect(assets.get('/assets/widget.js')?.type).toContain('javascript')
  })
})
