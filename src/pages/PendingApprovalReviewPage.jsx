import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePendingApprovalReview } from '../lib/usePendingApprovalReview'
import PendingApprovalReviewBody from '../components/PendingApprovalReviewBody'
import AccountActionFooter from '../components/AccountActionFooter'
import Tag from '../components/Tag'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'

// Standalone full-page route for /staff/pending/:id — reached directly
// (a bookmarked/shared link, or a reload that drops the Staff list's
// backgroundLocation state, e.g. an iOS PWA getting killed and restarted
// mid-review). The Staff list's own row click instead opens
// PendingApprovalSlideOverPanel, a drawer sharing this same review logic
// via usePendingApprovalReview and the same PendingApprovalReviewBody —
// see those two for the embedded presentation.
export default function PendingApprovalReviewPage() {
  const { isAdmin } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const review = usePendingApprovalReview(id, { onDone: () => navigate('/staff') })

  if (!isAdmin) return <Navigate to="/staff" replace />

  if (review.status === 'loading') return <p className="text-sm text-ink-muted">Loading…</p>

  if (review.status === 'error') {
    return (
      <div className="mx-auto max-w-7xl pb-12">
        <div className="card border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">Couldn&apos;t load this registration: {review.loadError}</p>
          <button onClick={() => navigate('/staff')} className="btn-secondary mt-3">Back to Staff list</button>
        </div>
      </div>
    )
  }

  if (review.status === 'decided') {
    return (
      <div className="mx-auto max-w-7xl pb-12">
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-muted">This registration has already been {review.decidedAs}.</p>
          <button onClick={() => navigate('/staff')} className="btn-secondary mt-4">Back to Staff list</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl md:max-w-2xl">
      <button
        type="button"
        onClick={() => navigate('/staff')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Pending approvals
      </button>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl font-bold text-ink">Review account registration</h1>
        <Tag variant="status" tone="warning">{REVIEW_STATUS_LABELS.pending}</Tag>
      </div>
      <p className="-mt-4 mb-6 text-xs text-ink-muted">Submitted {review.submittedDate} · {review.submittedTime}</p>

      <PendingApprovalReviewBody review={review} />

      {/* Sticky footer, bled flush to AppLayout main's own px-4/md:px-6/
          lg:px-8 — a sticky element's `bottom` offset is measured against
          its scrolling ancestor's padding edge and ignores negative
          margin trying to reach past it (verified against a real
          browser), so main's own pb-6/md:pb-8 can still leave a small gap
          here specifically; unlike the embedded drawer (see
          PendingApprovalSlideOverPanel), this page doesn't own that
          ancestor to reclaim the padding from. */}
      <div className="sticky bottom-0 mt-6 -mx-4 border-t border-slate-line bg-canvas-raised px-4 pt-3 pb-3 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <AccountActionFooter
          onApprove={review.approve}
          onReject={review.reject}
          isActioning={review.actioning}
          approveDisabledReason={review.approveDisabledReason}
          needsAdminConfirmation={review.needsAdminConfirmation}
          registrantName={review.fullName}
          roleCategoryLabel={review.assignedLabel}
        />
      </div>
    </div>
  )
}
