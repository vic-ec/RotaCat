import { useEffect, useRef, useState } from 'react'

// The sticky header's measured height. Moved out of StaffListPage as it was.
export function useStickyHeaderHeight() {
  // The mobile card list's sticky group labels (below, in the accounts
  // tab's md:hidden branch) need to stick exactly below this sticky
  // header's real rendered height — a hand-picked pixel constant drifts
  // out of sync the moment the header's own content changes (it already
  // has twice: once when the app-bar it used to sit under was removed,
  // again when the toolbar row moved into a FAB below md), leaving either
  // a gap the list shows through or an overlap that hides the label.
  // Measuring it directly removes that whole class of bug. ResizeObserver
  // re-fires on breakpoint changes too, so this stays correct without a
  // separate isAdmin/md branch to keep in sync by hand.
  // getBoundingClientRect(), not entry.contentRect — ResizeObserver's
  // default box is content-box, which EXCLUDES this header's own padding
  // (pt-2/pb-3 etc, part of what it actually paints while stuck). Reading
  // contentRect under-measured the header by exactly that padding, so
  // group labels stuck a padding's-worth too high — into the zone the
  // header's own bottom padding still covers, which its higher z-index
  // then painted over, obscuring the label instead of clearing it.
  const stickyHeaderRef = useRef(null)
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0)
  useEffect(() => {
    const el = stickyHeaderRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setStickyHeaderHeight(el.getBoundingClientRect().height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return {
    stickyHeaderRef, stickyHeaderHeight,
  }
}
