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

export const REQUEST_TIMEOUT_MS = 20_000

function isValuesResponse(body: unknown): body is ValuesResponse {
  if (typeof body !== 'object' || body === null) return false
  const r = body as Partial<ValuesResponse>
  return Array.isArray(r.values) && Array.isArray(r.data)
}

/**
 * The window's history; an empty list when the server has no History API,
 * refuses the query, answers with something other than history or never
 * recorded the path; undefined while asking again may still succeed: no
 * provider registered yet, a provider error, or the server out of reach. A
 * provider that rejects min and max (400) is asked again for the average alone. A server that has not answered within `timeoutMs` counts as
 * out of reach.
 */
export async function fetchHistory(
  path: string,
  windowMs: number,
  bucketMs: number,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  fetchFn: typeof fetch = fetch
): Promise<HistoryRow[] | undefined> {
  const signal = AbortSignal.timeout(timeoutMs)
  for (const withSpread of [true, false]) {
    try {
      const res = await fetchFn(historyUrl(path, windowMs, bucketMs, withSpread), {
        credentials: 'include',
        signal
      })
      if (res.status === 404) return []
      if (res.status >= 500) return undefined
      if (!res.ok) {
        if (withSpread && res.status === 400) continue
        return []
      }
      const body: unknown = await res.json()
      if (isValuesResponse(body)) return rowsFromResponse(body, path)
    } catch (err) {
      console.warn('history query failed', err)
      // A timeout or a network error may clear up; an answer that is not
      // JSON will not.
      return err instanceof SyntaxError ? [] : undefined
    }
  }
  return []
}

const FIRST_RETRY_MS = 10_000
const MAX_RETRY_MS = 60_000
export const GIVE_UP_MS = 10 * 60_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Asks `query` until it answers, for up to GIVE_UP_MS including the time the
 * queries take. After a server restart the widgets load before the history
 * provider plugin has registered, and a single query would leave them
 * live-only. Gives up early, with an empty list, once `wanted` turns false.
 */
export async function fetchHistoryWhenReady(
  query: (timeoutMs: number) => Promise<HistoryRow[] | undefined>,
  wanted: () => boolean,
  wait: (ms: number) => Promise<void> = sleep,
  now: () => number = Date.now
): Promise<HistoryRow[]> {
  const deadline = now() + GIVE_UP_MS
  let delay = FIRST_RETRY_MS
  for (;;) {
    const rows = await query(Math.max(1, Math.min(REQUEST_TIMEOUT_MS, deadline - now())))
    if (rows) return rows
    const left = deadline - now()
    if (left <= 0 || !wanted()) return []
    await wait(Math.min(delay, left))
    if (!wanted() || deadline - now() <= 0) return []
    delay = Math.min(MAX_RETRY_MS, delay * 2)
  }
}
