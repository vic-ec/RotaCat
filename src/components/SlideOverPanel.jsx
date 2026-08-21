import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'

// Shared right-edge slide-over shell — RotaCat's implementation of the
// spec's §12 master-detail panel, currently used by AccountSlideOverPanel.
// 35% width / min 320px on desktop, full-width below 768px (§15's
// "collapses to single-column on mobile" — full width IS the single-column
// collapse here, there's no separate mobile variant to build). A review
// flow with its own status/×-close header belongs on RequestReviewDrawer
// instead (see PendingApprovalSlideOverPanel) — this shell has no header
// of its own, just a scrollable body and an optional footer.
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
// `footer`: omit entirely for the default bottom-left Cancel button; pass
// a function `(close) => node` for custom footer content; pass `null`
// explicitly to render no footer bar at all, for a panel body that
// already carries its own close/decision affordance and would otherwise
// show a redundant second "Cancel" strip below it.
export default function SlideOverPanel({ fallbackPath = '/', children, footer }) {
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
      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
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
