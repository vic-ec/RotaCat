import { Check, X, MessageCircleQuestionMark } from 'lucide-react'
import InfoPopover from '../../components/InfoPopover'
import RequestRow from '../../components/RequestRow'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'
import { REQUEST_TYPE_LABELS, formatRequestValue } from './staffListHelpers'

// Requests › User Requests: account change requests awaiting review. Moved out of StaffListPage as it was.
export default function UserRequestsTab({
  navigate, location, accountRequests, requestActioningId, setExpandedRequestId, approveRequest, rejectRequest,
  filteredRequests, displayedRequests,
}) {
  return (
    <div className="mx-auto md:max-w-2xl">
      {accountRequests.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-muted">No account requests pending review.</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-muted">No requests match these filters.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="divide-y divide-slate-line">
              {displayedRequests.map((r) => {
                const isActioning = requestActioningId === r.id
                const secondaryLabel = r.requester?.role === 'doctor'
                  ? (r.requester?.category ? (CATEGORY_LABELS[r.requester.category] || r.requester.category) : null)
                  : (ROLE_LABELS[r.requester?.role] || r.requester?.role)
                const fullName = `${r.requester?.name ? `${r.requester.name} ` : ''}${r.requester?.surname || 'Unknown'}`
                const typeLabel = REQUEST_TYPE_LABELS[r.request_type] || r.request_type
                const requested = `Requested ${r.created_at?.slice(0, 10).split('-').reverse().join('-')}`
                return (
                  <RequestRow
                    key={r.id}
                    person={{ id: r.profile_id, ...r.requester }}
                    name={fullName}
                    meta={secondaryLabel}
                    onClick={() => navigate(`/account/${r.profile_id}`, { state: { backgroundLocation: location } })}
                    actions={[
                      {
                        title: 'What is requested',
                        element: (
                          <InfoPopover icon={<MessageCircleQuestionMark className="h-4 w-4" />} title="What is requested" label={`What ${fullName} is requesting`} tone="primary-text">
                            <p className="text-sm font-semibold text-ink">{typeLabel}</p>
                            {r.request_type !== 'deletion' && (
                              <p className="mt-0.5 text-ink">{formatRequestValue(r.current_value, r.request_type) || '—'} → <span className="font-medium">{formatRequestValue(r.requested_value, r.request_type)}</span></p>
                            )}
                            {r.reason && <p className="mt-1 italic">&quot;{r.reason}&quot;</p>}
                            <p className="mt-1 text-ink-muted">{requested}</p>
                            {r.request_type === 'deletion' && (
                              <p className="mt-1 text-flagAmber">Approving deactivates the account. The auth user itself must still be removed manually in Supabase.</p>
                            )}
                            <button type="button" onClick={() => setExpandedRequestId(r.id)} className="mt-2 font-medium text-accent underline">Open full review</button>
                          </InfoPopover>
                        ),
                      },
                      { icon: <Check className="h-4 w-4" />, title: 'Approve', label: `Approve ${fullName}'s request`, tone: 'success', onClick: () => approveRequest(r), disabled: isActioning },
                      { icon: <X className="h-4 w-4" />, title: 'Reject', label: `Reject ${fullName}'s request`, tone: 'danger', onClick: () => rejectRequest(r), disabled: isActioning },
                    ]}
                  />
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
