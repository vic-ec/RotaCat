// Shared placement math for every anchored popover in the app (Staff list's
// quick actions/filters/sort direction, SelectMenu, Roster's Archive
// filters) — rolls down from an anchor in the top or middle third of the
// screen, up from one in the bottom third, and clamps horizontally so the
// popover never runs off either edge of the viewport. Always `fixed`
// positioned (not absolute inside the trigger), so it escapes any
// ancestor's `overflow-hidden` instead of being clipped by it.
//
// `forceDown` skips the viewport-position heuristic entirely — for a
// SelectMenu nested inside another already-anchored popover (e.g. the
// Staff list's Filters sheet), the trigger's *raw* viewport position can
// land in the bottom third even though the enclosing sheet is short and
// sits nowhere near the bottom of the screen, which flipped that one
// dropdown to roll up while its siblings just above it rolled down.
export function computeAnchoredPosition(anchorRect, width, { forceDown = false } = {}) {
  const vh = window.innerHeight
  const vw = window.innerWidth
  const anchorMid = (anchorRect.top + anchorRect.bottom) / 2
  const rollsDown = forceDown || anchorMid < (vh * 2) / 3
  const left = Math.min(Math.max(8, anchorRect.right - width), vw - width - 8)
  return rollsDown
    ? { left, top: anchorRect.bottom + 6 }
    : { left, bottom: vh - anchorRect.top + 6 }
}
