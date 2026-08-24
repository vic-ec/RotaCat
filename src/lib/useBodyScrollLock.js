import { useEffect } from 'react'

// Stops the page behind a modal/sheet from scrolling while it's open.
//
// Without this, a touch drag that starts inside the sheet but over a
// non-scrolling child (a paragraph, a bordered info panel) scroll-chains
// straight through to the page underneath, so the list behind the Add
// staff form scrolled away under the finger. `overscroll-contain` on the
// sheet's own scroll container handles the "scrolled to the end, keep
// pulling" half of that; this handles the "this element never scrolls at
// all, so the gesture goes to the document" half.
//
// position:fixed rather than just overflow:hidden because iOS Safari
// ignores overflow:hidden on <body> for touch scrolling. That does reset
// the scroll position, so the offset is stashed and restored on unlock —
// otherwise closing a modal would jump the staff list back to the top.
//
// Ref-counted: two overlapping overlays (a modal opened from a slide-over)
// would otherwise have the inner one's unlock re-enable scrolling while
// the outer one is still up.
let lockCount = 0
let restore = null

function lock() {
  if (lockCount++ > 0) return
  const { body } = document
  const scrollY = window.scrollY
  restore = {
    scrollY,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    overflow: body.style.overflow,
  }
  body.style.position = 'fixed'
  body.style.top = `-${scrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.overflow = 'hidden'
}

function unlock() {
  if (--lockCount > 0) return
  lockCount = 0
  if (!restore) return
  const { body } = document
  body.style.position = restore.position
  body.style.top = restore.top
  body.style.left = restore.left
  body.style.right = restore.right
  body.style.overflow = restore.overflow
  // Synchronous, before paint — the browser has already forgotten the
  // offset that position:fixed discarded. Skipped at the top of the page,
  // where there is nothing to restore (and where jsdom would otherwise log
  // "Not implemented: Window's scrollTo()" for every modal under test).
  if (restore.scrollY) window.scrollTo(0, restore.scrollY)
  restore = null
}

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined
    lock()
    return unlock
  }, [active])
}
