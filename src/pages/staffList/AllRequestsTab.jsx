import RequestRow from '../../components/RequestRow'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'
import { filterRequestHistory } from '../../lib/requestHistory'

// Requests › All Requests: everything decided, either way. Moved out of StaffListPage as it was.
export default function AllRequestsTab({
  navigate, location, history, historyLoading, historyNames, historyFilters, historySearch, historySort,
}) {
  const shown = filterRequestHistory(history, historyFilters, historySearch)
  const ordered = historySort === 'desc' ? shown : [...shown].reverse()
  const reviewerName = id => { const p = historyNames.get(id); return p ? `${p.name} ${p.surname}` : null }
  const when = iso => (iso ? `${iso.slice(0, 10).split('-').reverse().join('-')}` : 'date unknown')
  const chip = {
    approved: 'bg-success-bg text-success',
    declined: 'bg-flagRed-bg text-flagRed',
    linked: 'bg-accent-light text-accent-dark',
  }
  const chipLabel = { approved: 'Approved', declined: 'Declined', linked: 'Linked' }
  return (
    <div className="mx-auto md:max-w-2xl">
      {historyLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : history.length === 0 ? (
        <div className="card p-10 text-center"><p className="text-sm text-ink-muted">No decided requests yet.</p></div>
      ) : ordered.length === 0 ? (
        <div className="card p-10 text-center"><p className="text-sm text-ink-muted">No requests match these filters.</p></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-line">
            {ordered.map(item => (
              <RequestRow
                key={item.id}
                person={item.person}
                name={item.name}
                meta={[item.category ? (CATEGORY_LABELS[item.category] || item.category) : (ROLE_LABELS[item.role] || item.role), item.typeLabel].filter(Boolean).join(' · ')}
                detail={item.detail}
                column={[reviewerName(item.reviewedBy) && `by ${reviewerName(item.reviewedBy)}`, when(item.at)].filter(Boolean).join(' · ')}
                onClick={item.profileId && item.status !== 'declined' ? () => navigate(`/account/${item.profileId}`, { state: { backgroundLocation: location } }) : undefined}
                trailing={(
                  <span className="flex flex-col items-end gap-0.5 pr-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip[item.status]}`}>{chipLabel[item.status]}</span>
                    <span className="text-[11px] text-ink-muted md:hidden">{when(item.at)}</span>
                  </span>
                )}
              >
                {item.note && <p className="text-xs italic text-ink-muted">&quot;{item.note}&quot;</p>}
              </RequestRow>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
