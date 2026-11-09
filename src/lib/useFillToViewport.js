import { useLayoutEffect, useState } from 'react'

// Lets a scrolling table container run to the bottom of the browser window
// — and no further — instead of a fixed 70vh. The container keeps
// `overflow: auto`, so with few rows it is only as tall as its rows, and
// with many it stops at the window's edge and scrolls inside itself; both
// read as "the table ends where the content or the window ends", never
// with a band of unused page below it.
//
// Measured, not guessed: the container's distance from the top of the
// viewport varies with the page's tabs, toolbar and any banner above it,
// so the max-height is `100dvh − top − gap`, re-measured on resize. `gap`
// is the page's own bottom padding (AppLayout's main: 24px, 32px from md).
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
      setMaxHeight(`max(240px, calc(100dvh - ${Math.round(top)}px - ${gap}px))`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [node, gap])

  return [setNode, maxHeight ? { maxHeight } : undefined]
}
