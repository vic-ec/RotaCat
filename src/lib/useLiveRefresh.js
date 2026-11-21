import { useEffect, useRef } from 'react'

// Keeps a page's data fresh without anyone reloading it: `refresh` runs
// when the tab or app comes back into view, and every `intervalMs` while it
// stays in view. Never while hidden — a phone in a pocket shouldn't be
// polling — and never more often than `minGapMs`, so coming back to the tab
// (which fires both `visibilitychange` and `focus`) is one refresh, not two.
//
// Polling rather than a live database subscription on purpose: with a
// handful of admins the difference is seconds, and this has no connection
// to keep alive or reconnect on poor hospital wifi.
//
// `refresh` may change every render; the latest one is always the one
// called. It should update quietly (no loading state): it runs under a page
// someone is reading.
export function useLiveRefresh(refresh, { intervalMs = 60000, minGapMs = 15000, enabled = true } = {}) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (!enabled) return undefined
    let last = Date.now()
    function run() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last < minGapMs) return
      last = Date.now()
      refreshRef.current?.()
    }
    const timer = setInterval(run, intervalMs)
    document.addEventListener('visibilitychange', run)
    window.addEventListener('focus', run)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('focus', run)
    }
  }, [enabled, intervalMs, minGapMs])
}
