import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { usePendingApprovalReview } from '../lib/usePendingApprovalReview'
import PendingApprovalReviewBody from './PendingApprovalReviewBody'
import AccountActionFooter from './AccountActionFooter'
import RequestReviewDrawer from './RequestReviewDrawer'
import Tag from './Tag'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'

// Renders /staff/pending/:id as a review drawer instead of a full-page
// navigation — triggered by the Staff list's pending-approvals row click
// (see App.jsx's background-location routing). Built on RequestReviewDrawer
// — the same shell the leave-request review drawer uses (title/status/×
// header, true flex-shrink-0 footer) — rather than the more general
// SlideOverPanel, so this presentation can never drift from that one in
// header/footer treatment the way it previously did (a sticky-inside-
// scroll footer with its own gap/overlap bugs, no × close, an extra
// "back to Pending approvals" link the leave drawer has no equivalent of).
// Same review state as the standalone page — see usePendingApprovalReview
// and PendingApprovalReviewBody, shared by both presentations.
export default function PendingApprovalSlideOverPanel() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()

  function close() {
    const backgroundLocation = location.state?.backgroundLocation
    navigate(backgroundLocation ? `${backgroundLocation.pathname}${backgroundLocation.search}` : '/staff', { replace: true })
  }

  const review = usePendingApprovalReview(id, { onDone: close })

  if (review.status === 'loading') {
    return (
      <RequestReviewDrawer title="Review account registration" onClose={close}>
        <p className="text-sm text-ink-muted">Loading…</p>
      </RequestReviewDrawer>
    )
  }

  if (review.status === 'error') {
    return (
      <RequestReviewDrawer title="Review account registration" onClose={close}>
        <p className="text-sm text-flagRed">Couldn&apos;t load this registration: {review.loadError}</p>
      </RequestReviewDrawer>
    )
  }

  if (review.status === 'decided') {
    return (
      <RequestReviewDrawer title="Review account registration" onClose={close}>
        <p className="text-sm text-ink-muted">This registration has already been {review.decidedAs}.</p>
      </RequestReviewDrawer>
    )
  }

  return (
    <RequestReviewDrawer
      title="Review account registration"
      statusTag={<Tag variant="status" tone="warning">{REVIEW_STATUS_LABELS.pending}</Tag>}
      meta={`Submitted ${review.submittedDate} · ${review.submittedTime}`}
      onClose={close}
      footer={
        <AccountActionFooter
          onApprove={review.approve}
          onReject={review.reject}
          isActioning={review.actioning}
          approveDisabledReason={review.approveDisabledReason}
          needsAdminConfirmation={review.needsAdminConfirmation}
          registrantName={review.fullName}
          roleCategoryLabel={review.assignedLabel}
        />
      }
    >
      <PendingApprovalReviewBody review={review} />
    </RequestReviewDrawer>
  )
}
