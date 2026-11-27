import { useEffect, useState } from 'react'
import Modal from './Modal'
import { LEAVE_TYPE_LABELS, naturalLeavePeriodLabel } from '../lib/leaveRequests'
import {
  cancelLeaveRequest, fetchRosterMonthsAffected, isValidCancelReason, rosterWarningText, CANCEL_REASON_MIN_LENGTH,
} from '../lib/leaveCancellation'
import { fetchLeaveShifts, afterLeaveCancelled, newBatchId } from '../lib/rosterEdits'
import { useAuth } from '../context/AuthContext'
import LeaveShiftsChoice from './LeaveShiftsChoice'

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
// `children`: anything the caller needs decided alongside (the roster asks
// what happens to shifts the leave opened); `canConfirm` false keeps the
// button off until it is.
// The shifts this leave took the doctor off (roster rows linked to it) are
// read here, wherever the leave is cancelled from: an admin chooses what
// happens to them in the same step (keep the cover, or put the doctor
// back); a doctor cancelling their own is told an admin will review them.
export default function CancelLeaveModal({ request, isOwn, onClose, onCancelled, children = null, canConfirm = true }) {
  const { user } = useAuth()
  const [reason, setReason] = useState('')
  const [shifts, setShifts] = useState([])
  const [shiftsChoice, setShiftsChoice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rosterWarning, setRosterWarning] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchLeaveShifts(request.id).then(rows => { if (!cancelled) setShifts(rows) }).catch(() => {})
    return () => { cancelled = true }
  }, [request.id])

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
      // An admin's choice for the shifts, as one undoable batch.
      if (!isOwn && shifts.length > 0 && shiftsChoice) {
        const batchId = newBatchId()
        const nameOf = () => who || 'Doctor'
        for (const s of shifts) {
          try {
            await afterLeaveCancelled({
              rosterMonthId: s.rosterMonthId, entry: s.entry, shiftCode: s.shiftCode, entries: [],
              undoShift: shiftsChoice === 'undo', adminId: user?.id, nameOf, batchId,
            })
          } catch { /* a shift that can't change stays for review on the roster */ }
        }
      }
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
          <button
            type="button"
            onClick={confirm}
            disabled={saving || !isValidCancelReason(reason) || !canConfirm || (!isOwn && shifts.length > 0 && !shiftsChoice)}
            className="btn-danger text-sm"
            title={isValidCancelReason(reason) ? undefined : 'A reason is required'}
          >
            {saving ? 'Cancelling…' : 'Cancel leave'}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary text-sm">
            Keep leave
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

      {children}
      {shifts.length > 0 && !isOwn && (
        <LeaveShiftsChoice doctorName={who || 'the doctor'} shifts={shifts} value={shiftsChoice} onChange={setShiftsChoice} />
      )}
      {shifts.length > 0 && isOwn && (
        <p className="mt-3 rounded-lg bg-canvas-sunken px-3 py-2 text-sm text-ink-light" data-testid="own-leave-shifts-note">
          This leave took you off {shifts.length === 1 ? 'a shift' : `${shifts.length} shifts`} ({shifts.map(s => s.entry.date).join(', ')}).
          The roster stays as it is until an admin reviews {shifts.length === 1 ? 'it' : 'them'}: they will either keep the cover or put you back, and you will see the result on the roster.
        </p>
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
