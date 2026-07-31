import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

function CalendarIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

// Small calendar-icon button next to a public-holiday shift on the
// dashboard — opens an anchored popover with the holiday's name on click,
// rather than taking up permanent row space with the name inline.
export default function PublicHolidayButton({ name }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), popRef, [triggerRef])

  function toggle() {
    if (open) { setOpen(false); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const width = 220
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, width) : null

  return (
    <span className="relative inline-flex flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Public holiday name"
        aria-expanded={open}
        className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-rose hover:bg-rose-tint"
      >
        <CalendarIcon className="h-3.5 w-3.5" />
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={popRef}
          style={{ ...positionStyle, width }}
          className="fixed z-50 rounded-lg border border-slate-line bg-canvas-raised p-3 text-sm text-ink shadow-raised"
        >
          {name || 'Public holiday'}
        </div>,
        document.body
      )}
    </span>
  )
}
