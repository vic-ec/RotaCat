import { useEffect, useState } from 'react'

// Shared desktop/mobile breakpoint check for components whose two layouts
// are genuinely different DOM (not just CSS hidden/shown) — e.g. a sticky
// side panel that becomes a bottom-sheet Modal, or a 12-column grid that
// becomes a stack of cards. Defaults to desktop=true when matchMedia is
// unavailable (e.g. jsdom in tests) so components render their inline/
// sticky-panel branch rather than the document-listener modal branch by
// default. Extracted from LeaveMatrix.jsx's own local copy once
// InternRotationsMatrix.jsx needed the identical check.
export function useIsDesktop(breakpoint = 1024) {
  const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const query = `(min-width: ${breakpoint}px)`
  const [isDesktop, setIsDesktop] = useState(() => (hasMatchMedia ? window.matchMedia(query).matches : true))
  useEffect(() => {
    if (!hasMatchMedia) return undefined
    const mq = window.matchMedia(query)
    const handler = e => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `query` is derived from the `breakpoint` param, which callers pass as a literal constant, not state
  }, [hasMatchMedia, breakpoint])
  return isDesktop
}
