import { describe, expect, it, vi } from 'vitest'
import type { ValuesResponse } from '@signalk/server-api/history'
import {
  GIVE_UP_MS,
  REQUEST_TIMEOUT_MS,
  fetchHistory,
  fetchHistoryWhenReady,
  historyUrl,
  rowsFromResponse
} from '../src/history.js'

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

  it('is undefined while the server has no history provider', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 501 }))
    expect(await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)).toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('is empty when the server has no History API', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    expect(await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)).toEqual([])
  })

  it('is undefined when the server cannot be reached', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)).toBeUndefined()
  })

  it('is empty when the query is refused even for the average alone', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 400 }))
    expect(await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('is empty when the user may not read the history', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 403 }))
    expect(await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('is empty when the answer is not JSON', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchFn = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))
    expect(await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)).toEqual([])
  })

  it('is empty when the answer is not history', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(ok({ message: 'hello' })))
    expect(await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('is undefined when the provider fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
    expect(await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)).toBeUndefined()
  })

  it('asks for the average alone when min and max are refused', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 400 }))
      .mockResolvedValueOnce(ok(response(['average'], [['2026-11-04T20:00:00Z', 3]])))
    const rows = await fetchHistory(PATH, 60_000, 1000, REQUEST_TIMEOUT_MS, fetchFn)
    expect(rows).toHaveLength(1)
    const second = String(fetchFn.mock.calls[1]?.[0])
    expect(second).toContain(encodeURIComponent(`${PATH}:average`))
    expect(second).not.toContain(':min')
  })
})

describe('fetchHistoryWhenReady', () => {
  const row = { time: 1, min: 1, max: 1, avg: 1 }

  /** A clock that only the waits and the queries, up to their timeout, move. */
  function clock(queryMs = 0, timerLateMs = 0) {
    let t = 0
    const now = () => t
    const wait = vi.fn<(ms: number) => Promise<void>>((ms) => {
      t += ms + timerLateMs
      return Promise.resolve()
    })
    const answering = (answers: (typeof row)[][]) =>
      vi.fn<(timeoutMs: number) => Promise<(typeof row)[] | undefined>>((timeoutMs) => {
        t += Math.min(queryMs, timeoutMs)
        return Promise.resolve(answers.shift())
      })
    return { now, wait, answering }
  }

  it('asks again until the provider answers', async () => {
    const c = clock()
    const query = c.answering([])
    query.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
    query.mockResolvedValueOnce([row])
    expect(await fetchHistoryWhenReady(query, () => true, c.wait, c.now)).toEqual([row])
    expect(query).toHaveBeenCalledTimes(3)
    expect(c.wait.mock.calls.map((call) => call[0])).toEqual([10_000, 20_000])
  })

  it('does not ask again once the provider answered empty', async () => {
    const c = clock()
    const query = c.answering([[]])
    expect(await fetchHistoryWhenReady(query, () => true, c.wait, c.now)).toEqual([])
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('gives up when the time is up, with no wait past it', async () => {
    const c = clock()
    const query = c.answering([])
    expect(await fetchHistoryWhenReady(query, () => true, c.wait, c.now)).toEqual([])
    expect(c.now()).toBe(GIVE_UP_MS)
    expect(Math.max(...c.wait.mock.calls.map((call) => call[0]))).toBe(60_000)
  })

  it('counts the time the queries take', async () => {
    const c = clock(REQUEST_TIMEOUT_MS)
    const query = c.answering([])
    await fetchHistoryWhenReady(query, () => true, c.wait, c.now)
    expect(c.now()).toBe(GIVE_UP_MS)
    const waited = c.wait.mock.calls.reduce((sum, call) => sum + call[0], 0)
    expect(waited).toBeLessThan(GIVE_UP_MS)
  })

  it('gives no query more time than is left', async () => {
    // Late timers, so a retry starts closer to the deadline than one timeout.
    const c = clock(Infinity, 7_000)
    const query = c.answering([])
    await fetchHistoryWhenReady(query, () => true, c.wait, c.now)
    const timeouts = query.mock.calls.map((call) => call[0])
    expect(timeouts[0]).toBe(REQUEST_TIMEOUT_MS)
    expect(Math.min(...timeouts)).toBeLessThan(REQUEST_TIMEOUT_MS)
  })

  it('stops when the widget no longer wants the history', async () => {
    const c = clock()
    const query = c.answering([])
    let wanted = true
    c.wait.mockImplementation(() => {
      wanted = false
      return Promise.resolve()
    })
    expect(await fetchHistoryWhenReady(query, () => wanted, c.wait, c.now)).toEqual([])
    expect(query).toHaveBeenCalledTimes(1)
  })
})

describe('fetchHistory timeout', () => {
  it('aborts a request the server never answers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchFn = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error)
          })
        })
    )
    expect(await fetchHistory(PATH, 60_000, 1000, 20, fetchFn)).toBeUndefined()
    expect(fetchFn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })
})
