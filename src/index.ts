import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Request, Response, NextFunction } from 'express'
import type { Plugin, ServerAPI } from '@signalk/server-api'
import { loadAssets, type Asset } from './assets.js'
import { ASSET_BASE, PLUGIN_ID, buildManifest } from './manifest.js'

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url))
const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url))

/** The express app the server hands plugins; ServerAPI leaves `use` out. */
type App = ServerAPI & {
  use?: (path: string, handler: (req: Request, res: Response, next: NextFunction) => void) => void
}

function packageVersion(): string {
  const pkg: unknown = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  const version = (pkg as { version?: unknown }).version
  return typeof version === 'string' ? version : '0.0.0'
}

export default function historyWidgets(app: App): Plugin {
  let running = false
  let assets = new Map<string, Asset>()
  let mounted = false
  let registered = false
  const manifest = buildManifest(packageVersion())

  const mount = () => {
    if (mounted || !app.use) return
    mounted = true
    // express cannot unmount a route, so a stopped plugin answers 404.
    app.use(ASSET_BASE, (req, res, next) => {
      const asset = running ? assets.get(req.path) : undefined
      if (!asset || (req.method !== 'GET' && req.method !== 'HEAD')) {
        next()
        return
      }
      res.type(asset.type).send(asset.body)
    })
  }

  const register = () => {
    if (registered) return
    registered = true
    app.registerResourceProvider({
      type: 'plotterExtensions',
      methods: {
        listResources: () => Promise.resolve(running ? { [PLUGIN_ID]: manifest } : {}),
        getResource: (id: string) =>
          running && id === PLUGIN_ID
            ? Promise.resolve(manifest)
            : Promise.reject(new Error(`No such plotterExtensions resource: ${id}`)),
        setResource: () => Promise.reject(new Error(`${PLUGIN_ID} is read-only`)),
        deleteResource: () => Promise.reject(new Error(`${PLUGIN_ID} is read-only`))
      }
    })
  }

  return {
    id: PLUGIN_ID,
    name: 'History Widgets',
    description:
      'History strip and wind steering widgets for Freeboard-SK and other Plotter Extensions hosts',
    schema: () => ({ type: 'object', properties: {} }),

    start() {
      running = true
      mount()
      register()
      loadAssets(PUBLIC_DIR)
        .then((loaded) => {
          assets = loaded
          app.setPluginStatus(`Serving ${manifest.widgets.length} widgets`)
        })
        .catch((err: unknown) => {
          app.setPluginError(
            `Web pages missing: ${err instanceof Error ? err.message : String(err)}`
          )
        })
    },

    stop() {
      running = false
    }
  }
}
