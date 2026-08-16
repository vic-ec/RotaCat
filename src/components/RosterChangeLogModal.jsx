import { useEffect, useState } from 'react'
import {
  fetchProfilesById, fetchAdminOptions, fetchDoctorOptions,
  nameMapFromProfiles, queryRosterChanges, rosterChangeDetail, ROSTER_ACTION_OPTIONS, ROLE_FILTER_OPTIONS,
} from '../lib/changeLog'
import DateFieldButton from './DateFieldButton'
import ChangeLogFilterMenu from './ChangeLogFilterMenu'
import { changeLogFilterFacets } from './changeLogFilterFacets'
import ClearableInput from './ClearableInput'
import FloatingActionMenu from './FloatingActionMenu'
import DetailInfoButton from './DetailInfoButton'
import LocumBadge from './LocumBadge'

const EMPTY_FILTERS = { dateFrom: '', dateTo: '', adminId: '', doctorId: '', action: '', role: '' }

function formatTimestampParts(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

function DoctorCell({ change, profilesById }) {
  const before = change.profile_id_before ? profilesById.get(change.profile_id_before) : null
  const after = change.profile_id_after ? profilesById.get(change.profile_id_after) : null

  if (before && after && before.id !== after.id) {
    return (
      <span>
        {before.name} {before.surname}{before.role === 'locum' && <LocumBadge />}
        {' → '}
        {after.name} {after.surname}{after.role === 'locum' && <LocumBadge />}
      </span>
    )
  }
  const person = after || before
  if (!person) return <span className="text-ink-muted">—</span>
  return <span>{person.name} {person.surname}{person.role === 'locum' && <LocumBadge />}</span>
}

// Searchable, filterable audit trail for one roster_month_id — every manual
// edit (assign/unassign/remove/move) logged by RosterGridPage/
// RosterVacancyModal. Scheduler-generated entries never appear here since
// nothing in the generation flow writes to roster_entry_changes.
export default function RosterChangeLogModal({ rosterMonthId, monthLabel, onClose }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  // Client-side, unlike the rest of `filters` (which go to the server as
  // query params) — narrows the already-fetched rows by the names the
  // table actually shows, the same "search by name" carve-out
  // WeekendPlannerChangeLogModal uses for its own log. Exists mainly to
  // give the FAB below a real search slot (Search is always offered — see
  // FloatingActionMenu's own contract) rather than a dead one.
  const [q, setQ] = useState('')
  const [changes, setChanges] = useState([])
  const [profilesById, setProfilesById] = useState(new Map())
  const [adminOptions, setAdminOptions] = useState([])
  const [doctorOptions, setDoctorOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminOptions().then(setAdminOptions)
    fetchDoctorOptions().then(setDoctorOptions)
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load closes over filters/rosterMonthId; refetch whenever either changes
  }, [rosterMonthId, filters])

  async function load() {
    setLoading(true)
    setError('')
    const roleIds = filters.role ? doctorOptions.filter(o => o.role === filters.role).map(o => o.value) : []
    const { data, error: err } = await queryRosterChanges({ rosterMonthId, ...filters, roleIds })
    if (err) { setError(err.message); setLoading(false); return }

    const ids = (data || []).flatMap(c => [c.changed_by, c.profile_id_before, c.profile_id_after])
    setProfilesById(await fetchProfilesById(ids))
    setChanges(data || [])
    setLoading(false)
  }

  const filtersActive = Object.values(filters).some(Boolean) || Boolean(q)
  const nameById = nameMapFromProfiles(profilesById)

  function fullName(id) {
    const p = profilesById.get(id)
    return p ? `${p.name} ${p.surname}` : ''
  }
  const searchTerm = q.trim().toLowerCase()
  const visibleChanges = searchTerm
    ? changes.filter(c => `${fullName(c.changed_by)} ${fullName(c.profile_id_before)} ${fullName(c.profile_id_after)}`.toLowerCase().includes(searchTerm))
    : changes

  const filterFacets = changeLogFilterFacets({
    adminOptions,
    doctorOptions,
    actionOptions: ROSTER_ACTION_OPTIONS,
    adminId: filters.adminId,
    doctorId: filters.doctorId,
    action: filters.action,
    onAdminChange: v => setFilters(f => ({ ...f, adminId: v })),
    onDoctorChange: v => setFilters(f => ({ ...f, doctorId: v })),
    onActionChange: v => setFilters(f => ({ ...f, action: v })),
    extraFilter: {
      label: 'Role',
      options: ROLE_FILTER_OPTIONS,
      value: filters.role,
      onChange: v => setFilters(f => ({ ...f, role: v })),
      disabled: !!filters.doctorId,
    },
  })
  const clearAll = () => { setFilters(EMPTY_FILTERS); setQ('') }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card flex w-full max-w-5xl max-h-[85vh] flex-col p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Review log — {monthLabel}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close review log">×</button>
        </div>

        {/* From/To stay on the row at every width — the FAB below has no
            slot for a date range. Search and the four facets (Admin,
            Doctor, Change type, Role) fold into the FAB below `md`. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DateFieldButton label="From" value={filters.dateFrom} max={filters.dateTo || undefined}
            onChange={v => setFilters(f => ({ ...f, dateFrom: v }))} />
          <DateFieldButton label="To" value={filters.dateTo} min={filters.dateFrom || undefined}
            onChange={v => setFilters(f => ({ ...f, dateTo: v }))} />
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <div className="w-56">
              <ClearableInput
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search by name…"
                className="input-field"
                clearLabel="Clear search"
              />
            </div>
            <ChangeLogFilterMenu
              adminOptions={adminOptions}
              doctorOptions={doctorOptions}
              actionOptions={ROSTER_ACTION_OPTIONS}
              adminId={filters.adminId}
              doctorId={filters.doctorId}
              action={filters.action}
              onAdminChange={v => setFilters(f => ({ ...f, adminId: v }))}
              onDoctorChange={v => setFilters(f => ({ ...f, doctorId: v }))}
              onActionChange={v => setFilters(f => ({ ...f, action: v }))}
              extraFilter={{
                label: 'Role',
                options: ROLE_FILTER_OPTIONS,
                value: filters.role,
                onChange: v => setFilters(f => ({ ...f, role: v })),
                disabled: !!filters.doctorId,
              }}
            />
            {filtersActive && (
              <button type="button" className="text-sm text-accent hover:underline" onClick={clearAll}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Inside the card, not the backdrop: the backdrop's own onClick is
            what closes this modal, so a FAB rendered as its sibling would
            dismiss the whole log on every tap. */}
        <FloatingActionMenu
          search={{ value: q, onChange: setQ, placeholder: 'Search by name…' }}
          filter={{
            facets: filterFacets,
            active: filtersActive,
            onClearAll: clearAll,
            sheetTitle: 'Filters',
          }}
        />

        {loading && <p className="mt-4 text-sm text-ink-muted">Loading…</p>}
        {error && <p className="mt-4 text-sm text-flagRed">{error}</p>}
        {!loading && !error && visibleChanges.length === 0 && (
          <p className="mt-4 text-sm text-ink-muted">
            {filtersActive ? 'No edits match these filters.' : 'No manual edits recorded for this roster yet.'}
          </p>
        )}
        {!loading && !error && visibleChanges.length > 0 && (
          <div className="mt-4 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-canvas-raised text-xs uppercase text-ink-muted">
                <tr>
                  <th className="whitespace-nowrap py-2 pr-4">Date</th>
                  <th className="whitespace-nowrap py-2 pr-4">Time</th>
                  <th className="whitespace-nowrap py-2 pr-4">Admin</th>
                  <th className="py-2 pr-4">Doctor</th>
                  <th className="whitespace-nowrap py-2 pr-4">Type</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="text-ink-light">
                {visibleChanges.map(c => {
                  const { date, time } = formatTimestampParts(c.changed_at)
                  const admin = profilesById.get(c.changed_by)
                  const detail = rosterChangeDetail(c, nameById)
                  return (
                    <tr key={c.id} className="border-t border-slate-line">
                      <td className="whitespace-nowrap py-2 pr-4 align-top">{date}</td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top text-ink-muted">{time}</td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top">{admin ? `${admin.name} ${admin.surname}` : 'Unknown'}</td>
                      <td className="max-w-[10rem] py-2 pr-4 align-top"><DoctorCell change={c} profilesById={profilesById} /></td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top capitalize">{c.action}</td>
                      <td className="max-w-[12rem] py-2 align-top">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-ink-muted">{detail}</span>
                          <DetailInfoButton text={detail} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
