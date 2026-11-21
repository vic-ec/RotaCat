import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Swipe between the app's top-level screens on a phone, in the bottom bar's
// own order: swipe left for the next one (Dashboard → Roster → … →
// Account), right for the previous. It rides alongside the bar, never
// instead of it — both end in the same router navigation, so the bar's
// highlight follows a swipe exactly as it follows a tap.
//
// The hard part of a page-level swipe is everything it must NOT steal:
// the Hours Summary scrolls sideways, sheets drag, sliders slide, and iOS
// owns the screen edges for its own back gesture. So a swipe only counts
// when it is unmistakably one (long, fast, flat), and never when it began
// somewhere that has its own use for a horizontal drag — see
// swipeStartIsReserved.

const MIN_DISTANCE = 70        // px of horizontal travel
const MAX_DURATION = 600       // ms — a slow drag is a scroll or a read, not a swipe
const FLATNESS = 2             // horizontal travel must be at least this many times the vertical
const EDGE_GUARD = 24          // px from either screen edge left to the OS back/forward gesture
const PHONE_QUERY = '(max-width: 767px)' // the bottom bar's own `md:hidden` boundary

// Which bar entry the current path belongs to — the same rule NavLink
// applies to light one up: an `end` item matches exactly, the rest by
// prefix, so /roster/123 is still Roster. -1 for a path no entry claims.
export function activeNavIndex(navItems, pathname) {
  return navItems.findIndex(item => (
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
  ))
}

// Where a swipe from `pathname` lands: 'left' (finger moving left) is the
// next screen, 'right' the previous. null at either end — the row of
// screens does not wrap, so Account is a wall on the left swipe and
// Dashboard on the right, the way the bar itself has two ends.
export function swipeDestination(navItems, pathname, direction) {
  const index = activeNavIndex(navItems, pathname)
  if (index === -1) return null
  const next = navItems[index + (direction === 'left' ? 1 : -1)]
  return next ? next.to : null
}

// True when a touch began somewhere that has its own claim on a horizontal
// drag, checked from the touched element up to the swipe surface:
//   - a form control (a range slider is dragged; text is selected)
//   - anything `position: fixed` — modals, bottom sheets, the FAB: overlays
//     sit above the page, and a swipe on one is never about the page under it
//   - a sideways-scrollable area that actually overflows (the roster grid,
//     Hours Summary, a tab strip): the drag is that area's scroll
//   - anything marked data-no-swipe-nav, the opt-out for future cases
export function swipeStartIsReserved(target, boundary) {
  for (let el = target; el && el !== boundary?.parentElement; el = el.parentElement) {
    if (el.nodeType !== 1) continue
    if (el.matches('input, textarea, select, [contenteditable="true"], [data-no-swipe-nav]')) return true
    const style = window.getComputedStyle(el)
    if (style.position === 'fixed') return true
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true
    if (el === boundary) break
  }
  return false
}

// 'left' | 'right' | null for a finished gesture.
export function swipeDirection({ dx, dy, duration }) {
  if (duration > MAX_DURATION) return null
  if (Math.abs(dx) < MIN_DISTANCE) return null
  if (Math.abs(dx) < Math.abs(dy) * FLATNESS) return null
  return dx < 0 ? 'left' : 'right'
}

function isPhone() {
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches
}

// Attach to the page's content column. Returns { ref, arrival }: `arrival`
// is { direction, count } for the most recent swipe navigation, which the
// layout uses to slide the incoming screen in from the side it came from
// (count changes per swipe, so the same direction twice replays).
export function useSwipeNavigation(navItems) {
  const ref = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [arrival, setArrival] = useState({ direction: null, count: 0 })

  // The listeners are attached once; they read the latest route and nav
  // through a ref rather than re-binding on every navigation.
  const latest = useRef({ navItems, pathname: location.pathname })
  latest.current = { navItems, pathname: location.pathname }

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let start = null

    function onTouchStart(e) {
      start = null
      if (e.touches.length !== 1 || !isPhone()) return
      const touch = e.touches[0]
      if (touch.clientX < EDGE_GUARD || touch.clientX > window.innerWidth - EDGE_GUARD) return
      if (swipeStartIsReserved(e.target, el)) return
      start = { x: touch.clientX, y: touch.clientY, time: Date.now() }
    }

    function onTouchMove(e) {
      // A second finger makes it a pinch, not a swipe.
      if (e.touches.length !== 1) start = null
    }

    function onTouchEnd(e) {
      if (!start) return
      const touch = e.changedTouches[0]
      const gesture = { dx: touch.clientX - start.x, dy: touch.clientY - start.y, duration: Date.now() - start.time }
      start = null
      // Dragging across text to select it is not a request to leave the page.
      if (window.getSelection && String(window.getSelection())) return
      const direction = swipeDirection(gesture)
      if (!direction) return
      const { navItems: items, pathname } = latest.current
      const to = swipeDestination(items, pathname, direction)
      if (!to) return
      setArrival(prev => ({ direction, count: prev.count + 1 }))
      navigate(to)
    }

    function onTouchCancel() { start = null }

    // Passive: this never calls preventDefault, so vertical scrolling stays
    // on the compositor and is never held up waiting on these handlers.
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [navigate])

  return { ref, arrival }
}
