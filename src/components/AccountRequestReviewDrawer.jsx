import { useState } from 'react'
import RequestReviewDrawer from './RequestReviewDrawer'
import Tag from './Tag'
import SectionLabel from './SectionLabel'

// Review drawer for one pending account change request (role/category/
// hours/deletion) — same shell (RequestReviewDrawer) and Approve/Decline
// footer shape as the leave-request and pending-registration review
// drawers, so all three of this app's "review one thing, decide yes/no"
// flows present identically (title/status/× header, true flex-shrink-0
// footer). The list row itself still carries its own inline Approve/
// Reject icon buttons for a quick decision without opening anything —
// this drawer is what "View request" now opens instead of navigating to
// the requester's full Account page with no decision affordance at all.
// Purely presentational: StaffListPage (which already formats these
// values for the row itself) passes them straight through, so the
// role/category/hours-value formatting logic stays defined in one place.
export default function AccountRequestReviewDrawer({
  requesterName, secondaryLabel, requestTypeLabel, changeLine, reason, deletionWarning,
  submittedDate, submittedTime, onClose, onApprove, onReject, isActioning,
}) {
  const [rejecting, setRejecting] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')

  return (
    <RequestReviewDrawer
      title={requestTypeLabel}
      statusTag={<Tag variant="status" tone="warning">Pending</Tag>}
      meta={`Submitted ${submittedDate} · ${submittedTime}`}
      onClose={onClose}
      footer={
        rejecting ? (
          <div className="flex w-full items-center gap-3">
            <button type="button" onClick={() => { setRejecting(false); setRejectNotes('') }} disabled={isActioning} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={() => onReject(rejectNotes)} disabled={isActioning} className="btn-danger flex-1 py-2.5 text-[15px]">
              {isActioning ? 'Rejecting…' : 'Confirm reject'}
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-3">
            <button type="button" onClick={onApprove} disabled={isActioning} className="btn-success flex-1 py-2.5 text-[15px]">
              {isActioning ? 'Approving…' : 'Approve request'}
            </button>
            <button type="button" onClick={() => setRejecting(true)} disabled={isActioning} className="btn-danger-outline py-2.5 text-[15px]">
              Reject…
            </button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium text-ink">{requesterName}</p>
          {secondaryLabel && <p className="text-xs text-ink-muted">{secondaryLabel}</p>}
        </div>

        <div>
          <SectionLabel className="mb-2">Requested change</SectionLabel>
          <p className="text-sm text-ink">{changeLine || requestTypeLabel}</p>
          {deletionWarning && <p className="mt-2 text-xs text-flagAmber">{deletionWarning}</p>}
        </div>

        {reason && (
          <div>
            <SectionLabel className="mb-2">Note from requester</SectionLabel>
            <p className="text-sm italic text-ink-light">&quot;{reason}&quot;</p>
          </div>
        )}

        {rejecting && (
          <div className="space-y-1.5">
            <label htmlFor="account-request-reject-notes" className="label-text">Reason (optional — saved on the request for your own records)</label>
            <textarea
              id="account-request-reject-notes"
              value={rejectNotes}
              onChange={e => setRejectNotes(e.target.value)}
              rows={3}
              placeholder="Why this wasn't approved…"
              className="input-field w-full"
            />
          </div>
        )}
      </div>
    </RequestReviewDrawer>
  )
}
