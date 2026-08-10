import { useRef } from 'react'
import { X } from 'lucide-react'
import { useDismissablePopover } from '../lib/useDismissablePopover'

// Right-side, persistent request-review drawer — the desktop counterpart to
// Modal.jsx for panels that should keep their originating list visible
// beside them rather than eclipsing it centered+dimmed (docs/design/
// layout-spec.md §12), collapsing to a full-width sheet below 768px (§15).
// Visually matches SlideOverPanel (no dimmed backdrop — the first outside
// click just closes the drawer, same as every other popover in the app —
// see useDismissablePopover), but `onClose` is a plain callback instead of
// a router navigation: this drawer is driven by a component's own
// open/closed state (e.g. LeaveApprovalQueue's `expandedId`), not a
// dedicated route, so there's no backgroundLocation to return to.
//
// `title`/`statusTag`/`meta` build the "identity and status" header (status
// pill inline with the title, "Received X · Y" directly below) — deliberately
// no breadcrumb row here; the corner × is the only way back out, per the
// "back affordance for a page, close affordance for a drawer" rule.
export default function RequestReviewDrawer({ title, statusTag, meta, onClose, children, footer }) {
  const panelRef = useRef(null)
  useDismissablePopover(true, onClose, panelRef)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-canvas-raised shadow-[-3px_0_10px_0_rgba(15,23,42,0.18)] md:w-[520px] md:border-l md:border-slate-line"
    >
      <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-slate-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {statusTag}
          </div>
          {meta && <p className="mt-0.5 text-xs text-ink-muted">{meta}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink md:h-8 md:w-8"
        >
          <X className="h-5 w-5 md:h-4 md:w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="flex-shrink-0 border-t border-slate-line px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  )
}
