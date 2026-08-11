import { X } from 'lucide-react'
import Tag from './Tag'
import SectionLabel from './SectionLabel'
import LeaveRequestSummary from './LeaveRequestSummary'
import { labelForLeaveCategory } from '../lib/leaveYearGrid'
import {
  LEAVE_GROUP_COLOR, LEAVE_TYPE_LABELS, leaveTypeGroupKey,
  formatDMY, formatDateTime, totalCalendarDays, totalLeaveDays,
} from '../lib/leaveMatrix'

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
export default function LeaveBlockDetail({ request, onClose, showClose }) {
  const doctor = request.profiles || {}
  const categoryLabel = doctor.category ? labelForLeaveCategory(doctor.category, doctor.contract_type) : null
  const annualLeaveDays = request.leave_type === 'annual' && request.annual_leave_days != null ? request.annual_leave_days : null
  const reviewerName = request.reviewer ? `${request.reviewer.name || ''} ${request.reviewer.surname || ''}`.trim() : null
  const calDays = totalCalendarDays(request)
  const leaveDays = totalLeaveDays(request)

  return (
    <>
      {showClose && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <LeaveRequestSummary
        request={request}
        fullName={`${doctor.name || ''} ${doctor.surname || ''}`.trim() || 'Unknown'}
        categoryLabel={categoryLabel}
        totalDays={calDays}
        annualLeaveDays={annualLeaveDays}
      />

      <div className="mt-4 border-t border-slate-line pt-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: LEAVE_GROUP_COLOR[leaveTypeGroupKey(request.leave_type)] }} />
          <span className="text-sm font-medium text-ink">{LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}</span>
          <Tag variant="status" tone={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'} className="ml-auto">
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </Tag>
        </div>

        <DetailLine label="Exact dates">{formatDMY(request.date_from)} – {formatDMY(request.date_to)}</DetailLine>
        <DetailLine label="Calendar days">{calDays}</DetailLine>
        <DetailLine label="Leave days">{leaveDays}</DetailLine>
        <DetailLine label="Submitted">{formatDateTime(request.created_at) || '—'}</DetailLine>

        {request.status === 'approved' && (
          <>
            <DetailLine label="Approved by">{reviewerName || 'an admin'}</DetailLine>
            <DetailLine label="Approved on">{formatDateTime(request.reviewed_at) || '—'}</DetailLine>
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
      </div>
    </>
  )
}
