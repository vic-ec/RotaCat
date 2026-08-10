import { useState } from 'react'

// Sticky decision footer for the pending-registration review drawer/page.
// Three states, never a nested modal — all inline swaps of this one footer:
//  - default: "Approve account" (wide, primary) + "Reject…" (narrower,
//    outlined) — not an equal-width pair, so they don't compete for
//    attention. Approve is disabled with a stated reason when the
//    role/category assignment isn't complete yet.
//  - rejecting: a reason step before the actual rejection — Cancel backs
//    out of just this step, not the whole page/drawer.
//  - confirmingAdmin: only shown when Approve is clicked while NEWLY
//    granting admin access (routine approvals skip straight to onApprove,
//    no unnecessary friction) — states who's getting admin access and what
//    it entails before actually approving.
export default function AccountActionFooter({
  onApprove, onReject, isActioning,
  approveDisabledReason, needsAdminConfirmation, registrantName, roleCategoryLabel,
}) {
  const [mode, setMode] = useState('default') // 'default' | 'rejecting' | 'confirmingAdmin'
  const [rejectReason, setRejectReason] = useState('')

  function startApprove() {
    if (needsAdminConfirmation) setMode('confirmingAdmin')
    else onApprove()
  }

  if (mode === 'rejecting') {
    return (
      <div className="space-y-3">
        <div>
          <label htmlFor="reject-reason" className="label-text">Reason (optional — included in the applicant&apos;s notification)</label>
          <textarea
            id="reject-reason"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={2}
            placeholder="Let them know why…"
            className="input-field w-full"
          />
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setMode('default'); setRejectReason('') }} disabled={isActioning} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => onReject(rejectReason)} disabled={isActioning} className="btn-danger flex-1">
            {isActioning ? 'Rejecting…' : 'Confirm reject'}
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'confirmingAdmin') {
    return (
      <div className="space-y-3 rounded-lg border border-flagBlue/30 bg-flagBlue-bg p-3">
        <p className="text-sm text-flagBlue">
          Approve {registrantName}&apos;s account with administrator access?
          {' '}They&apos;ll be approved as {roleCategoryLabel}, with permission to manage staff, leave requests, planners and settings.
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMode('default')} disabled={isActioning} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={onApprove} disabled={isActioning} className="btn-success flex-1">
            {isActioning ? 'Approving…' : 'Confirm approval'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={startApprove}
          disabled={isActioning || Boolean(approveDisabledReason)}
          className="btn-success flex-1 py-2.5 text-[15px]"
        >
          {isActioning ? 'Approving…' : 'Approve account'}
        </button>
        <button type="button" onClick={() => setMode('rejecting')} disabled={isActioning} className="btn-danger-outline py-2.5 text-[15px]">
          Reject…
        </button>
      </div>
      {approveDisabledReason && <p className="mt-2 text-xs text-ink-muted">{approveDisabledReason}</p>}
    </div>
  )
}
