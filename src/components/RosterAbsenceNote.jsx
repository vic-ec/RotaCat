import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

// A struck-through name on the roster: a doctor who is not working the
// shift they were rostered for (see entryAbsence in lib/rosterVacancy.js).
// Tapping the name says why. A real popover rather than a `title`: a title
// never opens on a touch tap, and the roster is read on phones.
//
// `summary` = { doctorName, headline, lines } from absenceSummary.
// `interactive` false renders the same struck-through name as plain text —
// for the roster's edit mode, where a tap on the cell already means "edit
// this shift" and must not also open a note.
export default function RosterAbsenceNote({ name, summary, interactive = true, className = '' }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), popRef, [triggerRef])

  const hint = `${summary.doctorName} — ${summary.headline}`
  if (!interactive) {
    return <span className={`truncate line-through decoration-ink-muted ${className}`} title={hint}>{name}</span>
  }

  function toggle(e) {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const width = 220
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, width) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`${hint}. Show details`}
        className={`min-w-0 truncate text-left line-through decoration-ink-muted hover:text-ink ${className}`}
      >
        {name}
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={hint}
          style={{ ...positionStyle, width }}
          className="fixed z-50 rounded-lg border border-edge bg-canvas-raised p-3 text-xs text-ink-light shadow-raised"
        >
          {/* Close, as every other popover and sheet in the app has one. */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{summary.headline}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="btn-close -mr-1 -mt-0.5 h-6 w-6 flex-shrink-0 text-ink-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-0.5 text-ink">{summary.doctorName}</p>
          {summary.lines.map(line => <p key={line} className="mt-1">{line}</p>)}
        </div>,
        document.body
      )}
    </>
  )
}
