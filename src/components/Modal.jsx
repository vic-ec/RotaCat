import { useRef } from 'react'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'

function CloseIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// Shared form/modal shell — centered 520px card on desktop, a genuine
// bottom sheet below 768px (capped at 85vh, rounded top corners, square
// bottom corners flush with the screen edge — not a full-screen sheet)
// with a header (title + close), scrollable body, and sticky footer.
// Matches MonthWorkspace.jsx's day-view popup, the app's other instance of
// this exact centered-popup/bottom-sheet pattern. See
// docs/design/layout-spec.md §11.
//
// `footer`: right-aligned buttons (Cancel then Primary, per spec) — pass
// them as children of a `<div className="flex justify-end gap-2">`-shaped
// fragment; Modal just supplies the sticky positioning around them.
export default function Modal({ title, onClose, children, footer, maxWidthClassName = 'md:max-w-[520px]' }) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 md:items-center md:p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={swipe.style}
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-xl rounded-b-none bg-canvas-raised md:rounded-b-xl md:shadow-raised ${maxWidthClassName}`}
      >
        <div {...swipe.handleProps} className="flex flex-shrink-0 touch-none items-center justify-between border-b border-slate-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-ink-muted hover:text-ink md:h-8 md:w-8"
          >
            <CloseIcon className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
