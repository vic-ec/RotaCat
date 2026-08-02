import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PendingApprovalReviewPage from '../pages/PendingApprovalReviewPage'
import { useDismissablePopover } from '../lib/useDismissablePopover'

// Renders /staff/pending/:id as a slide-over panel hugging the right edge of
// the viewport instead of a full-page navigation — triggered by the Staff
// list's pending-approvals row click (see App.jsx's background-location
// routing). Mirrors AccountSlideOverPanel exactly (same width, no backdrop,
// outside-click/Escape to dismiss, Cancel button bottom-left) per the "match
// settings of Staff List -> viewing another user's account" design ask.
export default function PendingApprovalSlideOverPanel() {
  const navigate = useNavigate()
  const location = useLocation()
  const panelRef = useRef(null)

  function close() {
    const backgroundLocation = location.state?.backgroundLocation
    navigate(backgroundLocation ? `${backgroundLocation.pathname}${backgroundLocation.search}` : '/staff', { replace: true })
  }

  useDismissablePopover(true, close, panelRef)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-canvas-raised shadow-[-3px_0_10px_0_rgba(15,23,42,0.18)] md:w-[25%] md:min-w-[320px]"
    >
      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
        <PendingApprovalReviewPage embedded onClose={close} />
      </div>
      <div className="flex-shrink-0 border-t border-slate-line px-5 py-3 md:px-6">
        <button type="button" onClick={close} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  )
}
