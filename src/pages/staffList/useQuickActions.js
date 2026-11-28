import { useEffect, useRef, useState } from 'react'
import { useDismissablePopover } from '../../lib/useDismissablePopover'
import { useSwipeToDismiss } from '../../lib/useSwipeToDismiss'

// A row's contact actions: the quick-action menu and its Message / Call
// flyout, the phone detail sheet, long-press, and the missing-detail
// toast. Moved out of StaffListPage as it was.
export function useQuickActions({ canContact }) {
  // Per-row quick-action popover (mobile, admin viewers) — anchored to
  // wherever the kebab button was actually pressed, iOS-Contacts-style,
  // rather than a bottom sheet unrelated to the tapped row's position.
  // Message/Call open a second, separate flyout popover (`secondaryFor`)
  // cascading below whichever of those two rows was tapped, rather than
  // expanding in place — it always rolls down and its options render in a
  // lighter color than the root menu's.
  const [quickActionPerson, setQuickActionPerson] = useState(null)
  const [quickActionAnchor, setQuickActionAnchor] = useState(null)
  const [secondaryFor, setSecondaryFor] = useState(null) // null | 'message' | 'call'
  const [secondaryAnchor, setSecondaryAnchor] = useState(null)
  const quickActionMenuRef = useRef(null)
  const quickActionTriggerRef = useRef(null) // the kebab/row currently driving the open menu
  const secondaryMenuRef = useRef(null)

  // A small in-app toast for the missing-contact-detail message — a plain
  // `alert()` triggers the browser's native dialog, which after a couple of
  // repeats offers a "Prevent this page from creating additional dialogs"
  // checkbox; a dismissable in-DOM banner sidesteps that entirely.
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useDismissablePopover(!!quickActionPerson, () => closeQuickActions(), quickActionMenuRef, [quickActionTriggerRef, secondaryMenuRef])

  // Mobile row tap opens this bottom sheet (contact details + one-tap
  // actions) instead of navigating straight to the account page — long
  // press/kebab still open the existing quick-action popover below.
  const [detailSheetPerson, setDetailSheetPerson] = useState(null)
  // The sheet's Message / Call flyout: { section, anchor } or null.
  const [sheetFlyout, setSheetFlyout] = useState(null)
  const detailSheetRef = useRef(null)
  const closeDetailSheet = () => { setDetailSheetPerson(null); setSheetFlyout(null) }
  function toggleSheetFlyout(section, el) {
    setSheetFlyout(f => (f?.section === section ? null : { section, anchor: el.getBoundingClientRect() }))
  }
  useDismissablePopover(!!detailSheetPerson, closeDetailSheet, detailSheetRef)
  const detailSheetSwipe = useSwipeToDismiss(closeDetailSheet)

  // Long-press (touch and hold) on a row also opens the quick-action menu,
  // alongside the existing kebab tap. `longPressFiredRef` suppresses the
  // click-to-navigate that would otherwise fire on release.
  const longPressTimerRef = useRef(null)
  const longPressFiredRef = useRef(false)
  function handleRowPointerDown(e, person) {
    if (!canContact || e.pointerType !== 'touch') return
    const target = e.currentTarget
    longPressFiredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      // Anchored to the row for positioning only — not exempted from the
      // menu's outside-tap mute the way the kebab is (see openQuickActions).
      toggleQuickActions(person, target, { anchorIsTrigger: false })
    }, 550)
  }
  // Lifting the finger after a long-press can be followed by a click on the
  // row. With the row no longer exempt from the menu's outside-tap mute,
  // that click would close the menu the instant it opened — cancelling the
  // touchend is what stops the browser synthesizing it.
  function handleRowTouchEnd(e) {
    if (longPressFiredRef.current) e.preventDefault()
  }
  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }
  function handleRowClick(person) {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    // Mobile-only entry point (desktop rows have their own onClick that
    // opens the slide-over panel) — a tap opens the contact/detail sheet
    // rather than navigating straight to the account page; "View Account"
    // inside the sheet is the new path to that full page.
    setDetailSheetPerson(person)
    setSheetFlyout(null)
  }

  // ── Quick-action popover handlers ────────────────────
  // `anchorIsTrigger`: the kebab is exempt from the menu's outside-tap mute
  // (useDismissablePopover's excludeRefs) so pressing it again toggles the
  // menu shut through its own handler. A long-press anchors to the whole
  // row instead, and exempting *that* let the next tap anywhere on the row
  // slip past the mute and open the detail sheet — the menu needed two
  // taps to close. A long-press menu treats the row like any outside tap.
  function openQuickActions(person, anchorEl, { anchorIsTrigger = true } = {}) {
    setQuickActionPerson(person)
    setQuickActionAnchor(anchorEl.getBoundingClientRect())
    setSecondaryFor(null)
    setSecondaryAnchor(null)
    quickActionTriggerRef.current = anchorIsTrigger ? anchorEl : null
  }
  function closeQuickActions() {
    setQuickActionPerson(null)
    setQuickActionAnchor(null)
    setSecondaryFor(null)
    setSecondaryAnchor(null)
    quickActionTriggerRef.current = null
  }
  // Pressing the kebab (or long-pressing the row) for the person whose menu
  // is already open closes it, rather than just re-anchoring the same menu.
  function toggleQuickActions(person, anchorEl, options) {
    if (quickActionPerson?.id === person.id) closeQuickActions()
    else openQuickActions(person, anchorEl, options)
  }
  // Message/Call open a flyout cascading below that specific row; tapping
  // the same one again closes it, tapping the other swaps to it.
  function toggleSecondary(section, anchorEl) {
    setSecondaryFor(s => {
      if (s === section) { setSecondaryAnchor(null); return null }
      setSecondaryAnchor(anchorEl.getBoundingClientRect())
      return section
    })
  }
  // A desktop row's Message / Call icon opens the same Mobile / WhatsApp
  // flyout on its own, below the icon; pressing it again closes it.
  function openContactFlyout(person, section, el) {
    if (quickActionPerson?.id === person.id && secondaryFor === section && !quickActionAnchor) { closeQuickActions(); return }
    setQuickActionPerson(person)
    setQuickActionAnchor(null)
    setSecondaryFor(section)
    setSecondaryAnchor(el.getBoundingClientRect())
    quickActionTriggerRef.current = el
  }
  function contactMissing(firstName) {
    setToast(`Sorry, we don't have this contact detail for ${firstName} yet.`)
  }

  return {
    quickActionPerson, quickActionAnchor, secondaryFor, secondaryAnchor, quickActionMenuRef, secondaryMenuRef,
    toast, detailSheetPerson, sheetFlyout, setSheetFlyout, detailSheetRef, closeDetailSheet, toggleSheetFlyout,
    detailSheetSwipe, handleRowPointerDown, handleRowTouchEnd, cancelLongPress, handleRowClick,
    closeQuickActions, toggleQuickActions, toggleSecondary, openContactFlyout, contactMissing,
  }
}
