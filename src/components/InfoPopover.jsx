import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import RowActionIcon from './RowActionIcon'

// An icon on a row that opens a small anchored note — the User Requests
// row's question bubble, which holds the request itself. Same popover
// mechanics as the roster's struck-through name (RosterAbsenceNote).
// `hover`: on a desktop (a pointer that hovers) it also opens on hover, and
// closes when the pointer leaves both the icon and the popup (with a short
// grace to cross between them). A click pins it.
export default function InfoPopover({ icon, title, label, tone = 'default', hover = false, children }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const [pinned, setPinned] = useState(false)
  useDismissablePopover(open, () => { setOpen(false); setPinned(false) }, popRef, [triggerRef])
  const canHover = hover && typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const hoverOpen = () => {
    if (!canHover) return
    clearTimeout(timer.current)
    if (!open && triggerRef.current) { setAnchorRect(triggerRef.current.getBoundingClientRect()); setOpen(true) }
  }
  const hoverClose = () => {
    if (!canHover || pinned) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(false), 200)
  }
  const width = 260
  const style = anchorRect ? computeAnchoredPosition(anchorRect, width) : null

  return (
    <>
      <span ref={triggerRef} className="inline-flex" onMouseEnter={hoverOpen} onMouseLeave={hoverClose}>
        <RowActionIcon
          icon={icon}
          title={title}
          label={label}
          tone={tone}
          onClick={() => {
            if (open && canHover && !pinned) { clearTimeout(timer.current); setPinned(true); return }
            if (open) { setOpen(false); setPinned(false); return }
            setAnchorRect(triggerRef.current.getBoundingClientRect())
            setOpen(true)
            setPinned(true)
          }}
        />
      </span>
      {open && style && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={title}
          style={{ ...style, width }}
          className="fixed z-50 popup"
          onClick={e => e.stopPropagation()}
          onMouseEnter={hoverOpen}
          onMouseLeave={hoverClose}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  )
}
