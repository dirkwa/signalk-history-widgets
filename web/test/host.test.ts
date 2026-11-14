// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onResume, pausedBetween } from '../src/host.js'

describe('pausedBetween', () => {
  it('takes a clock jump of more than 15 s between checks as a pause', () => {
    expect(pausedBetween(0, 5_000)).toBe(false)
    expect(pausedBetween(0, 15_000)).toBe(false)
    expect(pausedBetween(0, 15_001)).toBe(true)
  })
})

describe('onResume', () => {
  let visibility: DocumentVisibilityState

  beforeEach(() => {
    vi.useFakeTimers()
    visibility = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('calls back when the browser runs again after it was stopped', async () => {
    const resumed = vi.fn(() => Promise.resolve())
    onResume(resumed)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(resumed).not.toHaveBeenCalled()

    // A stopped browser runs no timers; on resuming, the clock has jumped.
    vi.setSystemTime(Date.now() + 3 * 60 * 60_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(resumed).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(resumed).toHaveBeenCalledOnce()
  })

  it('reloads again when a pause ends while a reload is under way', async () => {
    let finish: () => void = () => undefined
    const reload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    onResume(reload)

    vi.setSystemTime(Date.now() + 60 * 60_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(reload).toHaveBeenCalledOnce()

    // stopped again while the first reload still waits for an answer
    vi.setSystemTime(Date.now() + 60 * 60_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(reload).toHaveBeenCalledOnce()

    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('calls back once when a hidden page is shown again', async () => {
    const resumed = vi.fn(() => Promise.resolve())
    onResume(resumed)

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    // timers of a hidden page are throttled, which is no pause
    vi.setSystemTime(Date.now() + 10 * 60_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(resumed).not.toHaveBeenCalled()

    // shown again before the throttled timer's next tick: the tick right
    // after must not take the time since the last one for a second pause
    vi.setSystemTime(Date.now() + 50_000)
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(resumed).toHaveBeenCalledOnce()
  })
})
