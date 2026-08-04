import { useEffect, useRef, useState } from 'react'

// "Hide on scroll down, reveal on scroll up" — the same pattern Safari's
// URL bar and Twitter's header use. Returns true when the tracked element
// should be visible. Generic on purpose: any sticky secondary nav/toolbar
// that wants to get out of the way while scrolling a long page (a planner's
// sub-tabs, a long request/audit list) can reuse this rather than each
// implementing its own scroll-direction tracking.
//
// Always visible within `topThreshold`px of the top of the page regardless
// of direction, so a small bounce right at the top (e.g. iOS's overscroll)
// doesn't flicker it away. Ignores sub-`minDelta`px jitter between scroll
// events for the same reason.
export function useScrollReveal({ topThreshold = 24, minDelta = 4 } = {}) {
  const [visible, setVisible] = useState(true)
  const lastY = useRef(typeof window !== 'undefined' ? window.scrollY : 0)

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY
      if (y <= topThreshold) {
        setVisible(true)
        lastY.current = y
        return
      }
      const delta = y - lastY.current
      if (Math.abs(delta) < minDelta) return
      setVisible(delta < 0) // scrolling up (negative delta) reveals it
      lastY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [topThreshold, minDelta])

  return visible
}
