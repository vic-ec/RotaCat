import { useRef } from 'react'
import { useDismissablePopover } from '../lib/useDismissablePopover'

function CloseIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// Shared form/modal shell — centered 520px card on desktop, a full-screen
// sheet below 768px (header with title + close, scrollable body, sticky
// footer) rather than a small centered dialog on a phone-width screen
// (§15). See docs/design/layout-spec.md §11.
//
// `footer`: right-aligned buttons (Cancel then Primary, per spec) — pass
// them as children of a `<div className="flex justify-end gap-2">`-shaped
// fragment; Modal just supplies the sticky positioning around them.
export default function Modal({ title, onClose, children, footer, maxWidthClassName = 'md:max-w-[520px]' }) {
  const panelRef = useRef(null)
  useDismissablePopover(true, onClose, panelRef)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 md:items-center md:p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex h-full w-full flex-col overflow-hidden bg-canvas-raised md:h-auto md:max-h-[85vh] md:rounded-xl md:shadow-raised ${maxWidthClassName}`}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-line px-5 py-4">
          <p className="text-base font-semibold text-ink">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-ink-muted hover:text-ink md:h-8 md:w-8"
          >
            <CloseIcon className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
