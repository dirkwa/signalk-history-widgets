import { describe, expect, it, vi } from 'vitest'
import type { ValuesResponse } from '@signalk/server-api/history'
import { fetchHistory, historyUrl, rowsFromResponse } from '../src/history.js'

const PATH = 'environment.wind.speedTrue'

function response(methods: string[], data: unknown[][]): ValuesResponse {
  return {
    context: 'vessels.self',
    range: { from: '2026-11-04T20:00:00Z', to: '2026-11-04T20:30:00Z' },
    values: methods.map((method) => ({ path: PATH, method })),
    data
  } as unknown as ValuesResponse
}

describe('historyUrl', () => {
  it('asks for min, max and average at the bucket resolution', () => {
    const url = new URL(historyUrl(PATH, 30 * 60_000, 7_500, true), 'http://x')
    expect(url.pathname).toBe('/signalk/v2/api/history/values')
    expect(url.searchParams.get('paths')).toBe(`${PATH}:min,${PATH}:max,${PATH}:average`)
    expect(url.searchParams.get('duration')).toBe('1800')
    expect(url.searchParams.get('resolution')).toBe('8')
  })
})

describe('rowsFromResponse', () => {
  it('reads the columns by method', () => {
    const rows = rowsFromResponse(
      response(['average', 'max', 'min'], [['2026-11-04T20:00:00Z', 8, 10, 6]]),
      PATH
    )
    expect(rows).toEqual([{ time: Date.parse('2026-11-04T20:00:00Z'), avg: 8, min: 6, max: 10 }])
  })

  it('skips rows without an average and fills a missing spread', () => {
    const rows = rowsFromResponse(
      response(
        ['average'],
        [
          ['2026-11-04T20:00:00Z', null],
          ['2026-11-04T20:00:10Z', 7]
        ]
      ),
      PATH
    )
    expect(rows).toEqual([{ time: Date.parse('2026-11-04T20:00:10Z'), avg: 7, min: 7, max: 7 }])
  })
})

describe('fetchHistory', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

  it('is empty when the server has no history provider', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 501 }))
    expect(await fetchHistory(PATH, 60_000, 1000, fetchFn)).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('asks for the average alone when min and max are refused', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 400 }))
      .mockResolvedValueOnce(ok(response(['average'], [['2026-11-04T20:00:00Z', 3]])))
    const rows = await fetchHistory(PATH, 60_000, 1000, fetchFn)
    expect(rows).toHaveLength(1)
    const second = String(fetchFn.mock.calls[1]?.[0])
    expect(second).toContain(encodeURIComponent(`${PATH}:average`))
    expect(second).not.toContain(':min')
  })
})
