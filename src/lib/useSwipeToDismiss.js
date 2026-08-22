import { useRef, useState } from 'react'

// Drag-down-to-dismiss for mobile bottom sheets — matches native bottom-sheet
// behaviour (iOS share sheet, Android modal sheets): dragging the sheet's
// handle/header down translates it with the finger, and releasing past a
// distance or velocity threshold dismisses it; releasing short of that snaps
// it back into place. Mouse pointers are ignored entirely (this is a touch/
// pen gesture, not a click-and-drag one) so desktop's existing behaviour
// — no drag, dismiss via the outside-click/Escape handling this sits
// alongside — is unchanged.
//
// Spread `handleProps` onto the sheet's drag-start region (a grip handle, a
// header — not a scrollable body, which needs its own vertical gesture for
// scrolling instead of dragging the whole sheet), and `style` onto the
// sheet's own outer element to apply the live translate + snap-back
// transition.
const DISMISS_DISTANCE = 100 // px dragged down before release counts as a dismiss
const DISMISS_VELOCITY = 0.5 // px/ms — a fast flick dismisses well short of DISMISS_DISTANCE

export function useSwipeToDismiss(onDismiss) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef(null)

  function onPointerDown(e) {
    if (e.pointerType === 'mouse') return
    dragState.current = { pointerId: e.pointerId, startY: e.clientY, startTime: performance.now() }
    setDragging(true)
  }

  function onPointerMove(e) {
    const drag = dragState.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const delta = e.clientY - drag.startY
    setDragY(delta > 0 ? delta : 0)
  }

  function endDrag(e) {
    const drag = dragState.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const delta = e.clientY - drag.startY
    const elapsed = performance.now() - drag.startTime
    const velocity = delta / Math.max(elapsed, 1)
    dragState.current = null
    setDragging(false)
    setDragY(0)
    if (delta > DISMISS_DISTANCE || (delta > 20 && velocity > DISMISS_VELOCITY)) {
      onDismiss()
    }
  }

  return {
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    style: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform 0.2s ease-out',
    },
  }
}
