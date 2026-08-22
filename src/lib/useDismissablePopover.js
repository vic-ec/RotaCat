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
      // A popover's own dropdown renders through a portal straight onto
      // <body> (see SelectMenu/ToolbarFacet for why), so it's no longer a
      // DOM descendant of whatever popover it's nested inside visually —
      // e.g. a ToolbarFacet/ToolbarGroupInline row's secondary dropdown
      // inside the mobile Filters sheet. Without this, picking an option
      // there registered as an "outside" click on the enclosing sheet and
      // closed it before the sheet's own state could even update.
      //
      // `[role="dialog"]` covers the same problem for Modal/ActionSheet —
      // not portaled, just rendered as a JSX sibling at the bottom of
      // whatever page opens them, so a dialog opened on top of an already-
      // open accordion/popover elsewhere on the page (e.g. AccountSettingsPage's
      // Role & Access SectionRow, still open behind its own "Set to
      // active?" StatusChangeConfirmModal) isn't a DOM descendant of that
      // popover's ref either. Without this, the first tap on the dialog's
      // own Continue/Confirm button registered as an outside click on the
      // accordion — closing the accordion and swallowing the tap instead of
      // reaching the button — so a second tap was needed to actually fire
      // it.
      if (e.target.closest('[role="listbox"], [role="menu"], [role="dialog"]')) return
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
