import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json'
}

export interface Asset {
  type: string
  body: Buffer
}

/**
 * Every file of the built web pages, keyed by its URL path. Serving from this
 * list rather than from the file system keeps requests out of everything
 * else on disk.
 */
export async function loadAssets(dir: string): Promise<Map<string, Asset>> {
  const assets = new Map<string, Asset>()
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const file = join(entry.parentPath, entry.name)
    const url = '/' + relative(dir, file).split(sep).join('/')
    assets.set(url, {
      type: TYPES[extname(file)] ?? 'application/octet-stream',
      body: await readFile(file)
    })
  }
  return assets
}
