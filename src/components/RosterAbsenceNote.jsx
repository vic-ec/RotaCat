import { useEffect, useRef, useState } from 'react'
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
// `onCancelLeave` (admins, when the absence is leave): a "Cancel leave"
// button in the popup — for leave recorded in error.
// `interactive` false renders the same struck-through name as plain text —
// for the roster's edit mode, where a tap on the cell already means "edit
// this shift" and must not also open a note.
export default function RosterAbsenceNote({ name, summary, interactive = true, onCancelLeave = null, className = '' }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  useDismissablePopover(open, () => { setOpen(false); setPinned(false) }, popRef, [triggerRef])
  // On a desktop (a pointer that hovers) the note also opens on hover and
  // closes when the pointer leaves it and the name — with a short grace so
  // the pointer can travel into the note (to Cancel leave). A tap or click
  // still opens it everywhere.
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches
  const leaveTimer = useRef(null)
  // A click on a note the pointer opened keeps it open (pinned) until the
  // × or a click elsewhere, rather than closing it again.
  const [pinned, setPinned] = useState(false)
  useEffect(() => () => clearTimeout(leaveTimer.current), [])
  function hoverOpen() {
    if (!canHover) return
    clearTimeout(leaveTimer.current)
    if (!open && triggerRef.current) { setAnchorRect(triggerRef.current.getBoundingClientRect()); setOpen(true) }
  }
  function hoverClose() {
    if (!canHover || pinned) return
    clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(() => setOpen(false), 200)
  }

  const hint = `${summary.doctorName} — ${summary.headline}`
  if (!interactive) {
    return <span className={`truncate line-through decoration-ink-muted ${className}`} title={hint}>{name}</span>
  }

  function toggle(e) {
    e.stopPropagation()
    if (open && canHover && !pinned) { clearTimeout(leaveTimer.current); setPinned(true); return }
    if (open) { setOpen(false); setPinned(false); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
    setPinned(true)
  }

  const width = 220
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, width) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onMouseEnter={hoverOpen}
        onMouseLeave={hoverClose}
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
          className="fixed z-50 popup"
          // The popup is portalled, but React still bubbles its clicks to the
          // chip that holds the name — whose own click means something else.
          onClick={e => e.stopPropagation()}
          onMouseEnter={hoverOpen}
          onMouseLeave={hoverClose}
        >
          {/* Close, as every other popover and sheet in the app has one. */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{summary.headline}</p>
            <button
              type="button"
              onClick={() => { setOpen(false); setPinned(false) }}
              aria-label="Close"
              className="btn-close -mr-1 -mt-0.5 h-6 w-6 flex-shrink-0 text-ink-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-0.5 text-ink">{summary.doctorName}</p>
          {summary.lines.map(line => <p key={line} className="mt-1">{line}</p>)}
          {onCancelLeave && (
            <button
              type="button"
              onClick={() => { setOpen(false); setPinned(false); onCancelLeave() }}
              className="btn-secondary mt-3 w-full text-sm text-flagRed"
              data-testid="absence-cancel-leave"
            >
              Cancel leave
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
