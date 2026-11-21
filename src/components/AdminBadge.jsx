import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

// The review logs' "By" column: the admin's initials in a small round
// badge, with their full name on hover (mouse) or tap (touch/keyboard).
// A real popover rather than `title`, which never opens on a tap — same
// reasoning as DetailInfoButton.
export default function AdminBadge({ short, fullName }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const pointerType = useRef(null)
  useDismissablePopover(open, () => setOpen(false), popRef, [triggerRef])

  function show() {
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  // Mouse: hover shows it, leaving hides it, and the click a hover
  // already answered changes nothing. Touch and keyboard: click toggles.
  function handleClick(e) {
    if (e.detail !== 0 && pointerType.current === 'mouse') return
    if (open) setOpen(false)
    else show()
  }

  const label = fullName || 'Unknown'
  const width = Math.min(240, 24 + label.length * 7.5)
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, width) : null
  const wide = short.length > 2

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onPointerDown={e => { pointerType.current = e.pointerType }}
        onPointerEnter={e => { if (e.pointerType === 'mouse') show() }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setOpen(false) }}
        onClick={handleClick}
        className={`inline-flex h-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-tint text-[11px] font-bold text-accent ${wide ? 'px-2.5' : 'w-7'}`}
      >
        {short}
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={popRef}
          role="tooltip"
          style={{ ...positionStyle, width }}
          className="fixed z-50 rounded-lg border border-edge bg-canvas-raised px-3 py-1.5 text-center text-sm text-ink shadow-raised"
        >
          {label}
        </div>,
        document.body,
      )}
    </>
  )
}
