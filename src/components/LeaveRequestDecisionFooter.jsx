// Sticky decision footer for the leave-request review drawer. Two states:
//  - default: "Approve request" (primary, wide) + "Decline…" (outlined
//    destructive, deliberately narrower/quieter — approve and decline
//    should never compete equally for attention).
//  - rejecting: Decline opens a reason step (RequestReviewDrawer's body
//    renders the reason textarea) rather than declining immediately;
//    Cancel here backs out of just that step, not the whole drawer.
// No standalone "Request changes" action — there's no such status/workflow
// in the data model (leave_requests is only ever pending/approved/rejected)
// to back a third button with, so one isn't added.
export default function LeaveRequestDecisionFooter({
  rejecting, rejectNotes, onRejectCancel, onRejectConfirm,
  approveLabel, onApprove, onDeclineStart, isActioning, approveDisabled,
}) {
  if (rejecting) {
    return (
      <div className="flex w-full items-center gap-3">
        <button type="button" onClick={onRejectCancel} className="btn-secondary">Cancel</button>
        <button
          type="button"
          onClick={onRejectConfirm}
          disabled={isActioning || !rejectNotes.trim()}
          className="btn-danger flex-1 py-2.5 text-[15px]"
        >
          {isActioning ? 'Declining…' : 'Confirm decline'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full items-center gap-3">
      <button
        type="button"
        onClick={onApprove}
        disabled={approveDisabled}
        className="btn-success flex-1 py-2.5 text-[15px]"
      >
        {approveLabel}
      </button>
      <button
        type="button"
        onClick={onDeclineStart}
        disabled={isActioning}
        className="btn-danger-outline py-2.5 text-[15px]"
      >
        Decline…
      </button>
    </div>
  )
}
