import { ChevronDown as ChevronDownIcon } from 'lucide-react'
import LocumContactsPanel from '../../components/LocumContactsPanel'
import PendingApprovalRow from './PendingApprovalRow'

// Requests › New Users: sign-ups awaiting approval, then rostered locums
// needing an account. Moved out of StaffListPage as it was.
export default function NewUsersTab({
  navigate, location, pending, locumContactCount, setLocumContactCount, requestSectionsCollapsed,
  setRequestSectionsCollapsed, loadAll, approveAccount, rejectAccount, filteredPending, orderedPending,
}) {
  return (
    <div className="mx-auto md:max-w-2xl">
      {pending.length === 0 && locumContactCount === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-muted">No account requests. Sign-ups awaiting approval and rostered locums without an account appear here.</p>
        </div>
      ) : (
        /* Two sections, each a sheen header bar over its own card — the
           Staff list's own shape — and each shown only while it has
           rows: sign-ups waiting on an approval, then locums put on the
           roster by name and mobile who still need an account. */
        <div className="space-y-4">
          {pending.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setRequestSectionsCollapsed(c => ({ ...c, pending: !c.pending }))}
                aria-expanded={!requestSectionsCollapsed.pending}
                className="sheen-divider mb-2 w-full transition-[filter] hover:brightness-110 active:brightness-110"
              >
                <span>Pending approvals <span className="divider-meta ml-2 normal-case font-normal">{pending.length}</span></span>
                <ChevronDownIcon className={`divider-meta h-3.5 w-3.5 flex-shrink-0 transition-transform ${requestSectionsCollapsed.pending ? 'rotate-180' : ''}`} />
              </button>
              {!requestSectionsCollapsed.pending && (
                <div className="card overflow-hidden">
                  {filteredPending.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-ink-muted">No accounts match these filters.</p>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-line">
                        {orderedPending.map((person) => (
                          <PendingApprovalRow
                            key={person.id}
                            person={person}
                            approveAccount={approveAccount}
                            rejectAccount={rejectAccount}
                            onEdit={id => navigate(`/staff/pending/${id}`, { state: { backgroundLocation: location } })}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {locumContactCount > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setRequestSectionsCollapsed(c => ({ ...c, locums: !c.locums }))}
                aria-expanded={!requestSectionsCollapsed.locums}
                className="sheen-divider mb-2 w-full transition-[filter] hover:brightness-110 active:brightness-110"
              >
                <span>Rostered locums needing accounts <span className="divider-meta ml-2 normal-case font-normal">{locumContactCount}</span></span>
                <ChevronDownIcon className={`divider-meta h-3.5 w-3.5 flex-shrink-0 transition-transform ${requestSectionsCollapsed.locums ? 'rotate-180' : ''}`} />
              </button>
              {!requestSectionsCollapsed.locums && (
                <div className="card overflow-hidden">
                  <LocumContactsPanel onLinked={() => loadAll({ silent: true })} onCount={setLocumContactCount} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
