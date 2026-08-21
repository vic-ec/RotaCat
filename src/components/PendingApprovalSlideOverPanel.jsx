import PendingApprovalReviewPage from '../pages/PendingApprovalReviewPage'
import SlideOverPanel from './SlideOverPanel'

// Renders /staff/pending/:id as a slide-over panel hugging the right edge of
// the viewport instead of a full-page navigation — triggered by the Staff
// list's pending-approvals row click (see App.jsx's background-location
// routing). Same width/backdrop/dismiss conventions as AccountSlideOverPanel,
// but with no separate SlideOverPanel footer (footer={null}) — the review
// page carries its own sticky Approve account/Reject… footer, and a header
// back link already covers "leave without deciding", so a second bottom-left
// Cancel bar here would just be a redundant close control.
export default function PendingApprovalSlideOverPanel() {
  return (
    <SlideOverPanel fallbackPath="/staff" footer={null} bodyOwnsBottomFooter>
      {close => <PendingApprovalReviewPage embedded onClose={close} />}
    </SlideOverPanel>
  )
}
