// The Staff and Planners nav badges count what is waiting on an admin
// (sign-ups, account change requests, leave requests). AppLayout re-reads
// them once a minute and on return to the app; anything that just decided
// one of those calls notifyBadgesChanged() so the count drops at once
// rather than up to a minute later.
export const BADGES_CHANGED_EVENT = 'rotacat:badges-changed'

export function notifyBadgesChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(BADGES_CHANGED_EVENT))
}

// Calls `listener` on every notifyBadgesChanged(); returns the unsubscribe.
export function onBadgesChanged(listener) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(BADGES_CHANGED_EVENT, listener)
  return () => window.removeEventListener(BADGES_CHANGED_EVENT, listener)
}
