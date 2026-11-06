// Same-origin Signal K REST reads the bus does not carry.

import type { PathMeta } from './units.js'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** A path's metadata, with the server's resolved `displayUnits`. */
export async function fetchMeta(path: string): Promise<PathMeta | undefined> {
  try {
    const res = await fetch(`/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}/meta`, {
      credentials: 'include'
    })
    if (!res.ok) return undefined
    const body: unknown = await res.json()
    if (!isObject(body)) return undefined
    const meta: PathMeta = {}
    if (typeof body.units === 'string') meta.units = body.units
    if (typeof body.displayName === 'string') meta.displayName = body.displayName
    if (Array.isArray(body.zones)) meta.zones = body.zones
    const du = body.displayUnits
    if (isObject(du)) {
      meta.displayUnits = {}
      if (typeof du.targetUnit === 'string') meta.displayUnits.targetUnit = du.targetUnit
      if (typeof du.displayFormat === 'string') meta.displayUnits.displayFormat = du.displayFormat
    }
    return meta
  } catch {
    return undefined
  }
}

export interface PathInfo {
  path: string
  units: string | undefined
  value: number
  displayName: string | undefined
}

/** Every numeric path of the own vessel, for the path picker. */
export function numericPaths(node: unknown, prefix = '', out: PathInfo[] = []): PathInfo[] {
  if (!isObject(node)) return out
  if ('value' in node) {
    if (typeof node.value === 'number') {
      const meta = node.meta
      out.push({
        path: prefix,
        units: isObject(meta) && typeof meta.units === 'string' ? meta.units : undefined,
        value: node.value,
        displayName:
          isObject(meta) && typeof meta.displayName === 'string' ? meta.displayName : undefined
      })
    }
    return out
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'meta' || key === '$source' || key === 'timestamp' || key === 'values') continue
    numericPaths(child, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

export async function fetchNumericPaths(): Promise<PathInfo[]> {
  try {
    const res = await fetch('/signalk/v1/api/vessels/self', { credentials: 'include' })
    if (!res.ok) return []
    return numericPaths(await res.json()).sort((a, b) => a.path.localeCompare(b.path))
  } catch {
    return []
  }
}

/** The ids of the server's history providers; empty when it has none. */
export async function fetchHistoryProviders(): Promise<string[]> {
  try {
    const res = await fetch('/signalk/v2/api/history/_providers', { credentials: 'include' })
    if (!res.ok) return []
    const body: unknown = await res.json()
    return isObject(body) ? Object.keys(body) : []
  } catch {
    return []
  }
}

/**
 * A path's current value, whatever its type; undefined when the server has
 * none for this client (a 4xx answer). Throws when the server cannot answer
 * (no connection, 5xx), so a caller choosing between paths does not mistake
 * a failed lookup for a missing one.
 */
export async function readValue(path: string): Promise<unknown> {
  const res = await fetch(`/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}/value`, {
    credentials: 'include'
  })
  if (res.status >= 500) throw new Error(`${path}: HTTP ${res.status}`)
  if (!res.ok) return undefined
  return (await res.json()) as unknown
}

/** A path's current value, whatever its type; undefined when it has none. */
export async function fetchValue(path: string): Promise<unknown> {
  try {
    return await readValue(path)
  } catch {
    return undefined
  }
}
