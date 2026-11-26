import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

// The app's own "back": where the current page was reached from, so every
// page opened by a link (a Dashboard row, an Account row, a roster link)
// gets the same "‹ <previous page>" at its top, as a native app's back
// does. A page reached from the sidebar or tab bar (or a swipe between
// tabs) is a fresh start and gets none; switching tabs or filters inside a
// page keeps the page's original back. Remembered per history entry in
// sessionStorage, so it survives a reload and the browser's own Back.
const STORE = 'rotacat:back'

const LEAVE_TABS = { 'my-leave': 'My leave', team: 'Team Leave', planners: 'Planners', requests: 'Requests', rules: 'Leave rules' }

// A page can name itself better than its path can ("Cara's year"); it
// records that here when it renders, and the back that returns to it
// uses it.
const OWN_LABELS = new Map()
export function rememberPageLabel(pathname, label) {
  if (pathname && label) OWN_LABELS.set(pathname, label)
}

// A short name for a page, for "‹ Dashboard".
export function pageLabel(pathname, search = '') {
  if (OWN_LABELS.has(pathname)) return OWN_LABELS.get(pathname)
  const params = new URLSearchParams(search)
  if (pathname === '/') return 'Dashboard'
  if (pathname === '/roster') return params.get('view') === 'summary' ? 'Hours Summary' : 'Rosters'
  if (/^\/roster\/(generate|build)$/.test(pathname)) return 'Rosters'
  if (/^\/roster\/[^/]+$/.test(pathname)) return 'Roster'
  if (pathname === '/leave') return LEAVE_TABS[params.get('tab')] || 'Leave'
  if (pathname === '/staff' || pathname.startsWith('/staff/')) return 'Staff'
  if (pathname.startsWith('/account')) return 'Account'
  if (pathname === '/my-year') return 'My year'
  if (pathname.startsWith('/my-year/')) return 'Year'
  if (pathname === '/weekend') return 'Weekend planner'
  return 'Back'
}

function readStore() {
  try { return JSON.parse(sessionStorage.getItem(STORE) || '{}') } catch { return {} }
}
function writeStore(map) {
  try {
    const keys = Object.keys(map)
    // Keep the last 200 entries; older history entries are long gone.
    const trimmed = keys.length > 200 ? Object.fromEntries(keys.slice(-200).map(k => [k, map[k]])) : map
    sessionStorage.setItem(STORE, JSON.stringify(trimmed))
  } catch { /* storage unavailable: no back link, nothing breaks */ }
}

// AppLayout's tracker. Returns { to, label } for the current page, or null.
export function useBackTarget() {
  const location = useLocation()
  const prev = useRef(null)
  const [target, setTarget] = useState(() => readStore()[location.key] || null)
  useEffect(() => {
    const map = readStore()
    const last = prev.current
    prev.current = location
    if (map[location.key] !== undefined) { setTarget(map[location.key]); return }
    let next = null
    if (last && !location.state?.navTab) {
      next = last.pathname === location.pathname
        ? (map[last.key] || null)
        : { to: `${last.pathname}${last.search}`, label: pageLabel(last.pathname, last.search) }
    }
    map[location.key] = next
    writeStore(map)
    setTarget(next)
  }, [location])
  return target
}

// The current page's back target, for a page that draws its own back
// (the roster's floating header) instead of AppLayout's link.
export const BackTargetContext = createContext(null)
export function useBack() { return useContext(BackTargetContext) }

// Pages whose own header carries the back control.
export function drawsOwnBack(pathname) {
  return /^\/roster\/(?!generate$|build$)[^/]+$/.test(pathname)
}
