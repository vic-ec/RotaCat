import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'

// Shared right-edge slide-over shell — RotaCat's existing implementation of
// the spec's §12 master-detail panel (Account and Pending Approval review
// already used this exact pattern independently before it was extracted
// here). 35% width / min 320px on desktop, full-width below 768px (§15's
// "collapses to single-column on mobile" — full width IS the single-column
// collapse here, there's no separate mobile variant to build).
//
// Dismissal (outside click / Escape / the default footer's Cancel) always
// returns to wherever the panel was opened from — `backgroundLocation`, the
// React Router state set by the row that opened it — falling back to
// `fallbackPath` for a direct visit with no background state.
//
// `children` can be a plain node, or a function `(close) => node` for a
// panel body that needs to trigger its own dismissal (e.g. after an
// action completes).
//
// `footer`: omit entirely for the default bottom-left Cancel button: pass
// a function `(close) => node` for custom footer content; pass `null`
// explicitly to render no footer bar at all — for a panel body that
// already carries its own sticky action footer (e.g.
// PendingApprovalReviewPage's Approve/Reject bar) and would otherwise show
// a redundant second "Cancel" strip below it.
//
// `bodyOwnsBottomFooter`: set alongside `footer={null}` when that body's
// own footer sticks to the BOTTOM of this panel's scrolling area (not just
// its top, like the default Cancel-button case) — drops this panel's own
// bottom padding so the body's footer can supply that same space as its
// own padding instead. A `position: sticky` element's offset is measured
// against the padding EDGE of its scrolling ancestor and doesn't respect a
// negative margin trying to reach past that padding (verified against a
// real browser — the offset simply ignores it), so leaving this panel's
// own py-5 bottom padding in place left an unpainted band the scrolled
// content showed through, no matter how the body tried to cancel it.
export default function SlideOverPanel({ fallbackPath = '/', children, footer, bodyOwnsBottomFooter = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const panelRef = useRef(null)

  function close() {
    const backgroundLocation = location.state?.backgroundLocation
    navigate(backgroundLocation ? `${backgroundLocation.pathname}${backgroundLocation.search}` : fallbackPath, { replace: true })
  }

  useDismissablePopover(true, close, panelRef)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-canvas-raised shadow-[-3px_0_10px_0_rgba(15,23,42,0.18)] md:w-[35%] md:min-w-[320px]"
    >
      <div className={bodyOwnsBottomFooter ? 'flex-1 overflow-y-auto px-5 pt-5 md:px-6' : 'flex-1 overflow-y-auto px-5 py-5 md:px-6'}>
        {typeof children === 'function' ? children(close) : children}
      </div>
      {footer !== null && (
        <div className="flex-shrink-0 border-t border-slate-line px-5 py-3 md:px-6">
          {footer ? footer(close) : (
            <button type="button" onClick={close} className="btn-secondary">
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
