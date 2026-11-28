import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reloadOnMissingChunk } from './staleDeploy'

function fakeWindow() {
  const target = new EventTarget()
  const store = {}
  return {
    addEventListener: target.addEventListener.bind(target),
    dispatch: () => { const e = new Event('vite:preloadError', { cancelable: true }); target.dispatchEvent(e); return e },
    sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v } },
    location: { reload: vi.fn() },
  }
}

describe('reloadOnMissingChunk', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 28, 9, 0)) })

  it('reloads once when a page\'s code is missing, and swallows the error', () => {
    const win = fakeWindow()
    reloadOnMissingChunk(win)
    const e = win.dispatch()
    expect(win.location.reload).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it('does not loop: a second failure straight after lets the error through', () => {
    const win = fakeWindow()
    reloadOnMissingChunk(win)
    win.dispatch()
    const again = win.dispatch()
    expect(win.location.reload).toHaveBeenCalledTimes(1)
    expect(again.defaultPrevented).toBe(false)
  })

  it('reloads again for a later failure', () => {
    const win = fakeWindow()
    reloadOnMissingChunk(win)
    win.dispatch()
    vi.advanceTimersByTime(60000)
    win.dispatch()
    expect(win.location.reload).toHaveBeenCalledTimes(2)
  })
})
