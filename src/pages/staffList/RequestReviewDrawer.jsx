import AccountRequestReviewDrawer from '../../components/AccountRequestReviewDrawer'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'
import { REQUEST_TYPE_LABELS, formatRequestValue } from './staffListHelpers'

// The full review of the change request opened from User Requests. Moved out of StaffListPage as it was.
export default function RequestReviewDrawer({
  accountRequests, requestActioningId, expandedRequestId, setExpandedRequestId, approveRequest, rejectRequest,
}) {
  const r = accountRequests.find(req => req.id === expandedRequestId)
  if (!r) return null
  const secondaryLabel = r.requester?.role === 'doctor'
    ? (r.requester?.category ? (CATEGORY_LABELS[r.requester.category] || r.requester.category) : null)
    : (ROLE_LABELS[r.requester?.role] || r.requester?.role)
  const requesterName = `${r.requester?.name ? `${r.requester.name} ` : ''}${r.requester?.surname || 'Unknown'}`
  const changeLine = r.request_type !== 'deletion'
    ? `${formatRequestValue(r.current_value, r.request_type) || '—'} → ${formatRequestValue(r.requested_value, r.request_type)}`
    : null
  const submittedDate = r.created_at?.slice(0, 10).split('-').reverse().join('-')
  const submittedTime = r.created_at?.slice(11, 16)
  return (
    <AccountRequestReviewDrawer
      requesterName={requesterName}
      secondaryLabel={secondaryLabel}
      requestTypeLabel={REQUEST_TYPE_LABELS[r.request_type] || r.request_type}
      changeLine={changeLine}
      reason={r.reason}
      deletionWarning={r.request_type === 'deletion' ? 'Approving deactivates the account. To remove it entirely, open the account and use Delete account in its Danger Zone.' : null}
      submittedDate={submittedDate}
      submittedTime={submittedTime}
      onClose={() => setExpandedRequestId(null)}
      onApprove={async () => { await approveRequest(r); setExpandedRequestId(null) }}
      onReject={async notes => { await rejectRequest(r, notes); setExpandedRequestId(null) }}
      isActioning={requestActioningId === r.id}
    />
  )
}
