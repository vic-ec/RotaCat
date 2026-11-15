import { useEffect, useState } from 'react'
import Modal from './Modal'
import { LEAVE_TYPE_LABELS, naturalLeavePeriodLabel } from '../lib/leaveRequests'
import {
  cancelLeaveRequest, fetchRosterMonthsAffected, isValidCancelReason, rosterWarningText, CANCEL_REASON_MIN_LENGTH,
} from '../lib/leaveCancellation'

// The confirmation step in front of cancelling leave, shared by the
// doctor's My Requests and every admin surface (Team leave matrix, mobile
// detail sheet, table). Shows what is about to be cancelled, warns when a
// roster already covers those dates, and insists on a reason — both sides
// agreed a reason is always required, so the button stays disabled until
// one is typed.
//
// `request` needs id, leave_type, date_from, date_to, status and
// optionally `profiles` ({name, surname}) for the admin wording.
// `isOwn`: the viewer is cancelling their own leave (changes the copy).
// `onCancelled(updatedRow)` fires after the database confirms.
export default function CancelLeaveModal({ request, isOwn, onClose, onCancelled }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rosterWarning, setRosterWarning] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchRosterMonthsAffected(request.date_from, request.date_to).then(months => {
      if (!cancelled) setRosterWarning(rosterWarningText(months))
    })
    return () => { cancelled = true }
  }, [request.date_from, request.date_to])

  const who = request.profiles ? `${request.profiles.name || ''} ${request.profiles.surname || ''}`.trim() : ''
  const typeLabel = LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type
  const period = naturalLeavePeriodLabel(request.date_from, request.date_to)
  const wasApproved = request.status === 'approved'

  async function confirm() {
    if (!isValidCancelReason(reason) || saving) return
    setSaving(true)
    setError('')
    try {
      const row = await cancelLeaveRequest(request.id, reason)
      onCancelled?.(row)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Cancel this leave?"
      onClose={saving ? () => {} : onClose}
      centered
      maxWidthClassName="md:max-w-[480px]"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary text-sm">
            Keep leave
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || !isValidCancelReason(reason)}
            className="btn-danger text-sm"
            title={isValidCancelReason(reason) ? undefined : 'A reason is required'}
          >
            {saving ? 'Cancelling…' : 'Cancel leave'}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink">
        {isOwn
          ? `Your ${typeLabel.toLowerCase()} — ${period} — will be cancelled${wasApproved ? ' and the admins will be told' : ''}.`
          : `${who || 'This person'}’s ${typeLabel.toLowerCase()} — ${period} — will be cancelled and they will be notified.`}
        {wasApproved && request.leave_type === 'annual' && ' The days go back to the annual leave balance.'}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        The request stays on record as cancelled, with your name, the date and the reason below.
      </p>

      {rosterWarning && (
        <div className="mt-3 rounded-lg border border-flagAmber/40 bg-flagAmber-bg px-3 py-2 text-sm text-flagAmber" role="note">
          {rosterWarning}
        </div>
      )}

      <label className="label-text mt-4 block" htmlFor="cancel-leave-reason">Reason (required)</label>
      <textarea
        id="cancel-leave-reason"
        rows={3}
        value={reason}
        onChange={e => setReason(e.target.value)}
        disabled={saving}
        placeholder={isOwn ? 'e.g. Plans changed, no longer need the time off' : 'e.g. Cancelled at the doctor’s request by phone'}
        className="input-field mt-1 resize-none"
        autoFocus
      />
      {!isValidCancelReason(reason) && reason.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">Please write at least {CANCEL_REASON_MIN_LENGTH} characters.</p>
      )}
      {error && <p className="mt-2 text-sm text-flagRed" role="alert">{error}</p>}
    </Modal>
  )
}
