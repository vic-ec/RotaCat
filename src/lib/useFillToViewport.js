import { useLayoutEffect, useState } from 'react'

// Sizes a scrolling table container to run exactly to the bottom of the
// browser window — instead of a fixed 70vh. The container keeps `overflow:
// auto`, so with many rows it scrolls inside itself; with few, the frame
// still reaches the window's edge, so Hours Summary, Current & Upcoming
// Leave and All Leave all present the same sized table whatever their row
// counts.
//
// Measured, not guessed: the container's distance from the top of the
// viewport varies with the page's tabs, toolbar and any banner above it,
// so the height is `100dvh − top − gap`, re-measured on resize. `gap` is
// the page's own bottom padding (AppLayout's main: 24px, 32px from md);
// below md the fixed bottom tab bar is added to it.
//
// Returns [ref, style]. `ref` is a callback ref, so a container that only
// mounts once its data has loaded is still measured the moment it appears.
export function useFillToViewport(gap = 32) {
  const [node, setNode] = useState(null)
  const [maxHeight, setMaxHeight] = useState(undefined)

  useLayoutEffect(() => {
    if (!node) return undefined
    function measure() {
      const top = node.getBoundingClientRect().top + window.scrollY
      // Not below a sensible floor, so a container pushed far down a page
      // still shows a few rows rather than collapsing.
      const phone = typeof window.matchMedia === 'function' && !window.matchMedia('(min-width: 768px)').matches
      const bottom = phone ? gap - 8 + 70 : gap
      setMaxHeight(`max(240px, calc(100dvh - ${Math.round(top)}px - ${bottom}px))`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [node, gap])

  return [setNode, maxHeight ? { height: maxHeight } : undefined]
}
