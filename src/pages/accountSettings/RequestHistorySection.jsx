import { reviewStatusLabel } from '../../lib/statusLabels'
import { formatRequestedValue, REQUEST_STATUS_BADGE } from './accountSettingsHelpers'
import SectionRow from './SectionRow'
import { ClipboardIcon } from './icons'

// Your requests (your own account). Moved out of AccountSettingsPage as it was.
export default function RequestHistorySection({ myRequests }) {
  return (
    <SectionRow
      icon={<ClipboardIcon className="h-5 w-5" />}
      title="Your requests"
      subtitle={`${myRequests.length} submitted`}
    >
      <div className="divide-y divide-slate-line">
        {myRequests.map(r => (
          <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
            <div>
              <span className="font-medium text-ink capitalize">{r.request_type}</span>
              {r.requested_value && <span className="text-ink-muted"> → {formatRequestedValue(r)}</span>}
              <p className="text-xs text-ink-muted">{new Date(r.created_at).toLocaleDateString()}</p>
              {r.status !== 'pending' && r.reviewed_at && (
                <p className="text-xs text-ink-muted">
                  {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.reviewer ? `${r.reviewer.name} ${r.reviewer.surname}` : 'an admin'} on {new Date(r.reviewed_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REQUEST_STATUS_BADGE[r.status]}`}>
              {reviewStatusLabel(r.status)}
            </span>
          </div>
        ))}
      </div>
    </SectionRow>
  )
}
