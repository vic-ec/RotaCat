import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import RowActionIcon from './RowActionIcon'

// An icon on a row that opens a small anchored note — the User Requests
// row's question bubble, which holds the request itself. Same popover
// mechanics as the roster's struck-through name (RosterAbsenceNote).
export default function InfoPopover({ icon, title, label, tone = 'default', children }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), popRef, [triggerRef])
  const width = 260
  const style = anchorRect ? computeAnchoredPosition(anchorRect, width) : null

  return (
    <>
      <span ref={triggerRef} className="inline-flex">
        <RowActionIcon
          icon={icon}
          title={title}
          label={label}
          tone={tone}
          onClick={() => {
            if (open) { setOpen(false); return }
            setAnchorRect(triggerRef.current.getBoundingClientRect())
            setOpen(true)
          }}
        />
      </span>
      {open && style && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={title}
          style={{ ...style, width }}
          className="fixed z-50 rounded-lg border border-edge bg-canvas-raised p-3 text-xs text-ink-light shadow-raised"
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  )
}
