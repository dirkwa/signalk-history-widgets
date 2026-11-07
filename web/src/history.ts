// Seeding a series from the Signal K History API
// (/signalk/v2/api/history/values), served by whichever history provider
// plugin the server runs.

import type { ValuesResponse } from '@signalk/server-api/history'

export const HISTORY_VALUES = '/signalk/v2/api/history/values'

export interface HistoryRow {
  time: number
  min: number
  max: number
  avg: number
}

/** The request for `path` over the last `windowMs`, one row per bucket. */
export function historyUrl(
  path: string,
  windowMs: number,
  bucketMs: number,
  withSpread: boolean
): string {
  const methods = withSpread ? ['min', 'max', 'average'] : ['average']
  const params = new URLSearchParams({
    paths: methods.map((m) => `${path}:${m}`).join(','),
    duration: String(Math.ceil(windowMs / 1000)),
    resolution: String(Math.max(1, Math.round(bucketMs / 1000)))
  })
  return `${HISTORY_VALUES}?${params.toString()}`
}

/**
 * Rows with a number for the average; a provider that leaves out min or max
 * gives a row whose spread is the average alone.
 */
export function rowsFromResponse(response: ValuesResponse, path: string): HistoryRow[] {
  const column = (method: string) =>
    response.values.findIndex((v) => v.path === path && v.method === method)
  const avgAt = column('average')
  if (avgAt < 0) return []
  const minAt = column('min')
  const maxAt = column('max')
  const rows: HistoryRow[] = []
  for (const row of response.data) {
    const time = Date.parse(row[0])
    const avg = row[avgAt + 1]
    if (Number.isNaN(time) || typeof avg !== 'number') continue
    const min = minAt < 0 ? avg : row[minAt + 1]
    const max = maxAt < 0 ? avg : row[maxAt + 1]
    rows.push({
      time,
      avg,
      min: typeof min === 'number' ? min : avg,
      max: typeof max === 'number' ? max : avg
    })
  }
  return rows
}

function isValuesResponse(body: unknown): body is ValuesResponse {
  if (typeof body !== 'object' || body === null) return false
  const r = body as Partial<ValuesResponse>
  return Array.isArray(r.values) && Array.isArray(r.data)
}

/**
 * The window's history; an empty list when the server has no History API or
 * the provider never recorded the path, undefined while asking again may
 * still succeed: no provider registered yet, a provider error, or the server
 * out of reach. A provider that rejects min and max is asked again for the
 * average alone.
 */
export async function fetchHistory(
  path: string,
  windowMs: number,
  bucketMs: number,
  fetchFn: typeof fetch = fetch
): Promise<HistoryRow[] | undefined> {
  for (const withSpread of [true, false]) {
    try {
      const res = await fetchFn(historyUrl(path, windowMs, bucketMs, withSpread), {
        credentials: 'include'
      })
      if (res.status === 404) return []
      if (res.status === 501) return undefined
      if (!res.ok) continue
      const body: unknown = await res.json()
      if (isValuesResponse(body)) return rowsFromResponse(body, path)
    } catch (err) {
      console.warn('history query failed', err)
      return undefined
    }
  }
  return undefined
}

const FIRST_RETRY_MS = 10_000
const MAX_RETRY_MS = 60_000
export const GIVE_UP_MS = 10 * 60_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Asks `query` until it answers, for up to GIVE_UP_MS. After a server restart
 * the widgets load before the history provider plugin has registered, and a
 * single query would leave them live-only. Gives up early, with an empty list,
 * once `wanted` turns false.
 */
export async function fetchHistoryWhenReady(
  query: () => Promise<HistoryRow[] | undefined>,
  wanted: () => boolean,
  wait: (ms: number) => Promise<void> = sleep
): Promise<HistoryRow[]> {
  let waited = 0
  let delay = FIRST_RETRY_MS
  for (;;) {
    const rows = await query()
    if (rows) return rows
    if (waited >= GIVE_UP_MS || !wanted()) return []
    await wait(delay)
    if (!wanted()) return []
    waited += delay
    delay = Math.min(MAX_RETRY_MS, delay * 2)
  }
}
