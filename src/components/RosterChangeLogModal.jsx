import { useEffect, useState } from 'react'
import {
  fetchProfilesById, fetchAdminOptions, fetchDoctorOptions,
  queryRosterChanges, rosterDoctorMatchIds, ROSTER_ACTION_OPTIONS, ROLE_FILTER_OPTIONS,
} from '../lib/changeLog'
import { adminInitialsMap, rosterLogParts, ROSTER_TYPES } from '../lib/reviewLog'
import ReviewLogList, { Joiner, OffName } from './ReviewLogList'
import DateFieldButton from './DateFieldButton'
import FilterPanel from './FilterPanel'
import { changeLogFilterGroups, EMPTY_LOG_FILTERS, logFiltersActive } from '../lib/changeLogFilters'
import ClearableInput from './ClearableInput'
import FloatingActionMenu from './FloatingActionMenu'
import LocumBadge from './LocumBadge'


// `name`: someone with no profile to look up — a locum put on the roster by
// name and mobile only.
function Person({ id, profilesById, name = null }) {
  const person = id ? profilesById.get(id) : null
  if (!person && name) {
    return <span className="text-ink">{name}<LocumBadge /><span className="ml-1 text-xs text-ink-muted">no account</span></span>
  }
  if (!person) return <span className="text-ink-muted">{id ? 'Unknown' : '(unassigned)'}</span>
  return <span className="text-ink">{person.name} {person.surname}{person.role === 'locum' && <LocumBadge />}</span>
}

// The Change column: the shift on line 1, the people on line 2. For a
// replacement the first name is the doctor taken off and the second the
// one put on ("Jenna Smith with Musa Omar") — read with the Replaced chip
// in front, it says exactly what happened, which an arrow didn't.
function RosterChange({ parts, profilesById }) {
  const { type, shift, moveFrom } = parts
  return (
    <>
      <p className="font-semibold text-ink">
        {moveFrom ? <>{moveFrom}<Joiner>to</Joiner>{shift}</> : shift}
      </p>
      <p className="mt-0.5">
        {type === 'replaced' && (
          <><Person id={parts.before} profilesById={profilesById} /><Joiner>with</Joiner><Person id={parts.after} name={parts.afterName} profilesById={profilesById} /></>
        )}
        {(type === 'vacated' || type === 'removed') && (
          <OffName><Person id={parts.person} profilesById={profilesById} /></OffName>
        )}
        {(type === 'assigned' || type === 'moved') && <Person id={parts.person} name={parts.personName} profilesById={profilesById} />}
        {parts.advertised && (
          <span className="ml-1.5 whitespace-nowrap rounded border border-dashed border-slate-line px-1.5 text-xs text-ink-light">Opened for locum cover</span>
        )}
      </p>
      {parts.reason && <p className="mt-0.5 text-xs text-ink-light">Reason: {parts.reason}</p>}
    </>
  )
}

// Searchable, filterable audit trail for one roster_month_id — every manual
// edit (assign/unassign/remove/move) logged by RosterGridPage/
// RosterVacancyModal. Scheduler-generated entries never appear here since
// nothing in the generation flow writes to roster_entry_changes.
export default function RosterChangeLogModal({ rosterMonthId, monthLabel, onClose }) {
  const [filters, setFilters] = useState(EMPTY_LOG_FILTERS)
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
    const doctorMatchIds = rosterDoctorMatchIds({ doctorIds: filters.doctorIds, roles: filters.extra, doctorOptions })
    const { data, error: err } = await queryRosterChanges({
      rosterMonthId, dateFrom: filters.dateFrom, dateTo: filters.dateTo,
      adminIds: filters.adminIds, actions: filters.actions, doctorMatchIds,
    })
    if (err) { setError(err.message); setLoading(false); return }

    const ids = (data || []).flatMap(c => [c.changed_by, c.profile_id_before, c.profile_id_after])
    setProfilesById(await fetchProfilesById(ids))
    setChanges(data || [])
    setLoading(false)
  }

  const filtersActive = logFiltersActive(filters, q)

  function fullName(id) {
    const p = profilesById.get(id)
    return p ? `${p.name} ${p.surname}` : ''
  }
  const searchTerm = q.trim().toLowerCase()
  const visibleChanges = searchTerm
    ? changes.filter(c => `${fullName(c.changed_by)} ${fullName(c.profile_id_before)} ${fullName(c.profile_id_after)} ${c.locum_name || ''}`.toLowerCase().includes(searchTerm))
    : changes

  const adminShort = adminInitialsMap(profilesById, visibleChanges.map(c => c.changed_by))
  const logItems = visibleChanges.map(c => {
    const parts = rosterLogParts(c)
    return {
      id: c.id,
      at: c.changed_at,
      type: parts.type,
      typeLabel: ROSTER_TYPES[parts.type],
      admin: { short: adminShort.get(c.changed_by) ?? '?', fullName: fullName(c.changed_by) || 'Unknown' },
      change: <RosterChange parts={parts} profilesById={profilesById} />,
    }
  })

  const filterGroups = changeLogFilterGroups({
    filters, setFilters, doctorOptions, adminOptions,
    actionOptions: ROSTER_ACTION_OPTIONS,
    extra: { label: 'Role', options: ROLE_FILTER_OPTIONS },
  })
  const clearAll = () => { setFilters(EMPTY_LOG_FILTERS); setQ('') }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center scrim px-4" onClick={onClose}>
      <div className="card flex w-full max-w-5xl max-h-[85vh] flex-col p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Review log — {monthLabel}</h2>
          <button type="button" onClick={onClose} className="btn-close -mr-2 h-9 w-9 text-ink-muted" aria-label="Close review log">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* One row from md up: From/To, Search, then one Filter button whose
            panel holds Doctor, Admin, Change type and the log's fourth
            dimension — the Staff list / All Leave pattern. Below md the
            dates stay on the row (the FAB has no slot for a range) and
            Search and Filter fold into the FAB. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex w-full gap-2 md:w-80">
            <DateFieldButton label="From" fullWidth value={filters.dateFrom} max={filters.dateTo || undefined}
              onChange={v => setFilters(f => ({ ...f, dateFrom: v }))} />
            <DateFieldButton label="To" fullWidth value={filters.dateTo} min={filters.dateFrom || undefined}
              onChange={v => setFilters(f => ({ ...f, dateTo: v }))} />
          </div>
          <div className="hidden items-center gap-2 md:flex">
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
            <FilterPanel groups={filterGroups} />
            {filtersActive && (
              <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={clearAll}>
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
            groups: filterGroups,
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
          <div className="mt-4 flex-1 overflow-auto pb-16 md:pb-0">
            <ReviewLogList items={logItems} />
          </div>
        )}
      </div>
    </div>
  )
}
