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
//
// `maxHeight`: the popover's own capped height in px (e.g. a `max-h-60`
// caller passes 240) — opt-in, and only ever a refinement of the
// anchor-position heuristic above, never an override of `forceDown`. The
// anchor-third heuristic alone picks a side purely from where the trigger
// sits on screen, not whether the popover's own height actually fits
// there — a trigger positioned mid-screen (inside a bottom sheet/modal,
// say) still "rolls down" by that rule even when there isn't 70vh of room
// below it, so a tall popover opened from there can run off the bottom of
// the viewport with nothing left to do but scroll the whole page. Passing
// `maxHeight` checks the chosen side's actual available space and flips to
// the other side, but only when that side doesn't fit *and* the other side
// has more room — never flipping just because the anchor's own position
// nominally prefers one side, and never picking a side with strictly less
// room than the one already chosen.
export function computeAnchoredPosition(anchorRect, width, { forceDown = false, maxHeight = 0 } = {}) {
  const vh = window.innerHeight
  const vw = window.innerWidth
  const margin = 6
  const anchorMid = (anchorRect.top + anchorRect.bottom) / 2
  let rollsDown = forceDown || anchorMid < (vh * 2) / 3

  if (maxHeight > 0 && !forceDown) {
    const spaceBelow = vh - anchorRect.bottom - margin
    const spaceAbove = anchorRect.top - margin
    const chosenSpace = rollsDown ? spaceBelow : spaceAbove
    const otherSpace = rollsDown ? spaceAbove : spaceBelow
    if (chosenSpace < maxHeight && otherSpace > chosenSpace) rollsDown = !rollsDown
  }

  const left = Math.min(Math.max(8, anchorRect.right - width), vw - width - 8)
  return rollsDown
    ? { left, top: anchorRect.bottom + margin }
    : { left, bottom: vh - anchorRect.top + margin }
}
