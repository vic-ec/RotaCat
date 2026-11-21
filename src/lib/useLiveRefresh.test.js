import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLiveRefresh } from './useLiveRefresh'

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

describe('useLiveRefresh', () => {
  beforeEach(() => { vi.useFakeTimers(); setVisibility('visible') })
  afterEach(() => { vi.useRealTimers(); setVisibility('visible') })

  it('refreshes every interval while the page is in view, and not on mount', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 60000 }))
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60000)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(120000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('does nothing while hidden, then refreshes once on coming back into view', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 60000 }))
    setVisibility('hidden')
    vi.advanceTimersByTime(180000)
    expect(refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    // Returning to a tab fires both events; that is one refresh.
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('ignores a focus that comes straight after a refresh', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 60000, minGapMs: 15000 }))
    vi.advanceTimersByTime(60000)
    vi.advanceTimersByTime(5000)
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stops on unmount and when disabled', () => {
    const refresh = vi.fn()
    const { unmount } = renderHook(() => useLiveRefresh(refresh, { intervalMs: 60000 }))
    unmount()
    vi.advanceTimersByTime(120000)
    window.dispatchEvent(new Event('focus'))
    expect(refresh).not.toHaveBeenCalled()

    renderHook(() => useLiveRefresh(refresh, { enabled: false }))
    vi.advanceTimersByTime(120000)
    expect(refresh).not.toHaveBeenCalled()
  })
})
