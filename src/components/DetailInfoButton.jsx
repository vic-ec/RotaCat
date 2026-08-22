import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

function InfoIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 11v5M12 8v.01" />
    </svg>
  )
}

// (i) button next to a truncated table cell — opens an anchored popover
// with the full text instead of wrapping the cell and blowing out the
// row's height, which is what happened before with the review log's
// Details column. Also reused anywhere else a field needs a hover-or-tap
// hint rather than a permanently-visible caption line (e.g. the pending-
// approval Active from/until fields) — `label` names what's being
// revealed for those callers; table-cell truncation callers leave it at
// the default. Deliberately click/tap-triggered rather than the native
// `title` attribute: `title` never opens on a touch tap at all (no hover
// to trigger it), so a mobile viewer got no explainer whatsoever — a
// real popover works the same way on both.
export default function DetailInfoButton({ text, label = 'View full details' }) {
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

  const width = 260
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, width) : null

  return (
    <span className="relative inline-flex flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className="flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-sunken hover:text-ink"
      >
        <InfoIcon className="h-3.5 w-3.5" />
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={popRef}
          style={{ ...positionStyle, width }}
          className="fixed z-50 rounded-lg border border-slate-line bg-canvas-raised p-3 text-sm text-ink-light shadow-raised"
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  )
}
