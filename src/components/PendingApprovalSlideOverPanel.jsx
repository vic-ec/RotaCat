import PendingApprovalReviewPage from '../pages/PendingApprovalReviewPage'
import SlideOverPanel from './SlideOverPanel'

// Renders /staff/pending/:id as a slide-over panel hugging the right edge of
// the viewport instead of a full-page navigation — triggered by the Staff
// list's pending-approvals row click (see App.jsx's background-location
// routing). Mirrors AccountSlideOverPanel exactly (same width, no backdrop,
// outside-click/Escape to dismiss, Cancel button bottom-left) per the "match
// settings of Staff List -> viewing another user's account" design ask.
export default function PendingApprovalSlideOverPanel() {
  return (
    <SlideOverPanel fallbackPath="/staff">
      {close => <PendingApprovalReviewPage embedded onClose={close} />}
    </SlideOverPanel>
  )
}
