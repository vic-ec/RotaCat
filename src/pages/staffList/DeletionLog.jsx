import { CATEGORY_LABELS } from '../../lib/categoryLabels'

// All Staff (admin): recently deleted accounts. Moved out of StaffListPage as it was.
export default function DeletionLog({
  deletionLog, deletionLogOpen, setDeletionLogOpen,
}) {
  return (
    <section className="mt-8" aria-labelledby="deletion-log-heading">
      <button
        type="button"
        id="deletion-log-heading"
        onClick={() => setDeletionLogOpen(open => !open)}
        aria-expanded={deletionLogOpen}
        className="flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <span aria-hidden="true">{deletionLogOpen ? '▾' : '▸'}</span>
        Recently deleted accounts ({deletionLog.length})
      </button>
      {deletionLogOpen && (
        <div className="card mt-3 overflow-hidden">
          <ul className="divide-y divide-edge">
            {deletionLog.map(entry => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <div>
                  <span className="font-medium text-ink">{entry.name} {entry.surname}</span>
                  {entry.email && <span className="ml-2 text-ink-muted">{entry.email}</span>}
                  <span className="ml-2 text-xs text-ink-light">
                    {[entry.role && (entry.role[0].toUpperCase() + entry.role.slice(1)), entry.category && (CATEGORY_LABELS[entry.category] || entry.category)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="text-xs text-ink-light">
                  Deleted {new Date(entry.deleted_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {entry.deleter ? ` by ${entry.deleter.name} ${entry.deleter.surname}` : ''}
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-edge px-4 py-2 text-xs text-ink-light">
            Deleted accounts cannot be restored. Someone who returns will need a new account.
          </p>
        </div>
      )}
    </section>
  )
}
