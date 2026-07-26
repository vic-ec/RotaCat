import { useEffect } from 'react'

// Closes an open panel/popover on an outside click or Escape — shared by
// every "expandable" surface in the app (quick-action menus, filter
// popovers, Account page accordions, Staff list edit panels) so they all
// behave the same way: clicking outside collapses the open panel instead
// of acting on whatever's underneath it.
//
// The outside click is swallowed via a capture-phase listener with
// stopPropagation()+preventDefault() — not just observed — so the first
// outside tap only closes the panel ("mutes" the background) rather than
// closing it AND triggering whatever's under the tap (a row navigating
// away, a button firing) in the same gesture. A second, separate tap is
// needed to actually interact with that background element once the panel
// has closed.
export function useDismissablePopover(active, onDismiss, ref, excludeRefs) {
  useEffect(() => {
    if (!active) return
    const excludeList = excludeRefs ? (Array.isArray(excludeRefs) ? excludeRefs : [excludeRefs]) : []
    function onClickOutside(e) {
      if (ref.current && ref.current.contains(e.target)) return
      if (excludeList.some(r => r?.current && r.current.contains(e.target))) return
      e.stopPropagation()
      e.preventDefault()
      onDismiss()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('click', onClickOutside, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClickOutside, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [active, onDismiss, ref, excludeRefs])
}
