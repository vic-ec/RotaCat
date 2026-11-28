import LeaveTypeIcon from './LeaveTypeIcon'
import { useState } from 'react'
import { X } from 'lucide-react'
import Tag from './Tag'
import CancelLeaveModal from './CancelLeaveModal'
import { CANCELLABLE_STATUSES } from '../lib/leaveCancellation'
import SectionLabel from './SectionLabel'
import LeaveRequestSummary from './LeaveRequestSummary'
import { labelForLeaveCategory } from '../lib/leaveYearGrid'
import {
  LEAVE_TYPE_LABELS,
  formatDMY, formatDateTime, totalCalendarDays, totalLeaveDays,
} from '../lib/leaveMatrix'
import { reviewStatusLabel } from '../lib/statusLabels'

function DetailLine({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="flex-shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="min-w-0 text-right text-xs font-medium text-ink">{children}</span>
    </div>
  )
}

// One leave request's full specifics: identity + period summary
// (LeaveRequestSummary), then exact dates, calendar/leave day counts,
// submission time, and the approve-or-reject metadata (reviewer + when, reason
// from admin_notes) plus the requester's note. Extracted from LeaveMatrix so
// the desktop year matrix and the mobile Team Leave views render leave details
// identically. `showClose` renders an internal × (the matrix's sticky panel
// wants one; a Modal-hosted instance doesn't, since Modal has its own).
// `canCancel` + `onCancelled`: when the viewer may cancel this leave (an
// admin on the Team leave views), a "Cancel leave" action appears for
// pending/approved rows and opens CancelLeaveModal; `onCancelled(row)` fires
// once the database confirms so the host can refetch and close the detail.
const STATUS_TONE = { approved: 'success', rejected: 'danger', cancelled: 'neutral' }

export default function LeaveBlockDetail({ request, onClose, showClose, canCancel = false, onCancelled }) {
  const [cancelling, setCancelling] = useState(false)
  const doctor = request.profiles || {}
  const categoryLabel = doctor.category ? labelForLeaveCategory(doctor.category, doctor.contract_type) : null
  const annualLeaveDays = request.leave_type === 'annual' && request.annual_leave_days != null ? request.annual_leave_days : null
  const reviewerName = request.reviewer ? `${request.reviewer.name || ''} ${request.reviewer.surname || ''}`.trim() : null
  const cancellerName = request.canceller ? `${request.canceller.name || ''} ${request.canceller.surname || ''}`.trim() : null
  // Filed by an admin on the doctor's behalf (see submitLeaveRequest's
  // capturedBy) — stays on record whatever happens to the row afterwards.
  const capturedOnBehalf = Boolean(request.submitted_by) && request.submitted_by !== request.profile_id
  const submitterName = request.submitter ? `${request.submitter.name || ''} ${request.submitter.surname || ''}`.trim() : null
  const cancelledBySelf = request.cancelled_by && request.cancelled_by === request.profile_id
  const showCancelAction = canCancel && CANCELLABLE_STATUSES.includes(request.status)
  const calDays = totalCalendarDays(request)
  const leaveDays = totalLeaveDays(request)

  return (
    <>
      {/* In a side panel (no window title of its own): "Leave details"
          with the close button on that row, as the phone's window has. */}
      {showClose && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-ink">Leave details</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-close h-8 w-8 flex-shrink-0 text-ink-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <LeaveRequestSummary
        request={request}
        fullName={`${doctor.name || ''} ${doctor.surname || ''}`.trim() || 'Unknown'}
        categoryLabel={categoryLabel}
        totalDays={calDays}
        annualLeaveDays={annualLeaveDays}
        periodOnly
      />

      <div className="mt-4 border-t border-slate-line pt-3">
        <div className="mb-1 flex items-center gap-1.5">
          <LeaveTypeIcon leaveType={request.leave_type} size="sm" />
          <span className="text-sm font-medium text-ink">{LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}</span>
          <Tag variant="status" tone={STATUS_TONE[request.status] || 'warning'} className="ml-auto">
            {reviewStatusLabel(request.status)}
          </Tag>
        </div>

        <DetailLine label="Exact dates">{formatDMY(request.date_from)} – {formatDMY(request.date_to)}</DetailLine>
        <DetailLine label="Calendar days">{calDays}</DetailLine>
        <DetailLine label="Leave days">{leaveDays}</DetailLine>
        <DetailLine label="Submitted">{formatDateTime(request.created_at) || '—'}</DetailLine>
        {capturedOnBehalf && <DetailLine label="Captured by">{submitterName || 'an admin'}, on the doctor&rsquo;s behalf</DetailLine>}

        {request.status === 'approved' && (
          <>
            <DetailLine label="Approved by">{reviewerName || 'an admin'}</DetailLine>
            <DetailLine label="Approved on">{formatDateTime(request.reviewed_at) || '—'}</DetailLine>
          </>
        )}
        {request.status === 'cancelled' && (
          <>
            {/* The original approval stays on record above the cancellation. */}
            {request.reviewed_at && (
              <>
                <DetailLine label="Approved by">{reviewerName || 'an admin'}</DetailLine>
                <DetailLine label="Approved on">{formatDateTime(request.reviewed_at) || '—'}</DetailLine>
              </>
            )}
            <DetailLine label="Cancelled by">{cancelledBySelf ? 'the doctor' : (cancellerName || 'an admin')}</DetailLine>
            <DetailLine label="Cancelled on">{formatDateTime(request.cancelled_at) || '—'}</DetailLine>
            {request.cancel_reason && (
              <div className="mt-2 rounded border border-slate-line bg-canvas-cool px-2 py-1.5">
                <SectionLabel>Reason for cancelling</SectionLabel>
                <p className="mt-0.5 text-xs text-ink">{request.cancel_reason}</p>
              </div>
            )}
          </>
        )}
        {request.status === 'rejected' && (
          <>
            <DetailLine label="Rejected by">{reviewerName || 'an admin'}</DetailLine>
            <DetailLine label="Rejected on">{formatDateTime(request.reviewed_at) || '—'}</DetailLine>
            {request.admin_notes && (
              <div className="mt-2 rounded border border-slate-line bg-canvas-cool px-2 py-1.5">
                <SectionLabel>Reason</SectionLabel>
                <p className="mt-0.5 text-xs text-ink">{request.admin_notes}</p>
              </div>
            )}
          </>
        )}

        {request.notes && (
          <div className="mt-2 rounded border border-slate-line bg-canvas-cool px-2 py-1.5">
            <SectionLabel>Note from requester</SectionLabel>
            <p className="mt-0.5 text-xs italic text-ink-light">&ldquo;{request.notes}&rdquo;</p>
          </div>
        )}

        {showCancelAction && (
          <div className="mt-4 border-t border-slate-line pt-3">
            <button type="button" onClick={() => setCancelling(true)} className="btn-danger-outline text-sm">
              Cancel leave
            </button>
          </div>
        )}
      </div>

      {cancelling && (
        <CancelLeaveModal
          request={request}
          isOwn={false}
          onClose={() => setCancelling(false)}
          onCancelled={row => { setCancelling(false); onCancelled?.(row) }}
        />
      )}
    </>
  )
}
