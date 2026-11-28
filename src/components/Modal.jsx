import { useRef } from 'react'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { X as CloseIcon } from 'lucide-react'

// Shared form/modal shell — centered 520px card on desktop, a genuine
// bottom sheet below 768px (capped at 85vh, rounded top corners, square
// bottom corners flush with the screen edge — not a full-screen sheet)
// with a header (title + close), scrollable body, and sticky footer.
// Matches MonthWorkspace.jsx's day-view popup, the app's other instance of
// this exact centered-popup/bottom-sheet pattern. See
// docs/design/layout-spec.md §11.
//
// `footer`: the buttons, primary first on the left, then any secondary
// action, then Cancel last (Create account · Clear form · Cancel) — pass
// them as a fragment in that order; Modal just supplies the sticky
// positioning and the left-aligned row around them.
//
// `centered`: opt in to a centered card on EVERY viewport rather than the
// bottom-sheet-below-768px default — for a dialog the viewer deliberately
// opened from a button and is meant to fill in (My leave's "Request
// leave"), as opposed to one that drills into whatever they just tapped (a
// planner day), where rising from the bottom keeps the tapped thing in
// view. Swipe-to-dismiss goes with the sheet: a centered card isn't
// anchored to the bottom edge, so a downward drag has nowhere to go.
//
// `header`: replaces the title text with a control of the caller's own (a
// day stepper), beside the same Close button; `title` still names the dialog.
// `heightClassName`: a fixed height instead of sizing to the content, for a
// sheet whose content changes while it's open and whose header controls
// shouldn't move under the finger.
export default function Modal({
  title, onClose, children, footer, centered = false, maxWidthClassName = 'md:max-w-[520px]',
  header, heightClassName = 'max-h-[85vh]',
}) {
  const panelRef = useRef(null)
  useDismissablePopover(true, onClose, panelRef)
  const swipe = useSwipeToDismiss(onClose)
  // The page behind stays put while this is open — see the hook. Paired
  // with `overscroll-contain` on the scrollable body below: the hook stops
  // gestures over the sheet's non-scrolling parts (headings, the bordered
  // info panels in Add staff) reaching the document, and overscroll-contain
  // stops a scroll that runs off the end of the body from continuing there.
  useBodyScrollLock(true)

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center scrim md:items-center md:p-4 ${
        centered ? 'items-center p-4' : 'items-end'
      }`}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={centered ? undefined : swipe.style}
        className={`flex ${heightClassName} w-full flex-col overflow-hidden border border-edge bg-canvas-raised md:rounded-b-xl md:shadow-raised ${
          centered ? 'rounded-xl shadow-raised' : 'rounded-t-xl rounded-b-none'
        } ${maxWidthClassName}`}
      >
        <div
          {...(centered ? {} : swipe.handleProps)}
          className={`flex flex-shrink-0 items-center justify-between gap-2 border-b border-slate-line px-5 py-4 ${centered ? '' : 'touch-none'}`}
        >
          {header ?? <h2 className="text-base font-semibold text-ink">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-close h-11 w-11 text-ink-muted md:h-8 md:w-8"
          >
            <CloseIcon className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-shrink-0 justify-start gap-2 border-t border-slate-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
