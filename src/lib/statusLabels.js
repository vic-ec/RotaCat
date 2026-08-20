// User-facing labels for the three approve/reject queues — leave requests,
// staff account approvals (Staff's "Pending Approvals") and account change
// requests (Staff's "User Requests"). 'pending' reads as "Pending review"
// rather than a bare "Pending": every one of these rows is waiting on a
// named human decision, and "Pending" on its own left people asking pending
// what.
//
// Display only. The stored enum values are untouched, so every query,
// filter value and RLS policy keeps matching on 'pending'/'approved'/
// 'rejected' — only the text rendered next to them changes.
export const REVIEW_STATUS_LABELS = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
}

// Falls back to a capitalised version of anything not in the map, so a
// status added to the enum later shows up readably instead of blank.
export function reviewStatusLabel(status) {
  if (!status) return ''
  return REVIEW_STATUS_LABELS[status] || (status.charAt(0).toUpperCase() + status.slice(1))
}
