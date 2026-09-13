import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { reviewStatusLabel } from '../lib/statusLabels'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn, fetchInternRotationsForDoctorIds, groupRotationsByDoctorId } from '../lib/internRotations'
import { buildAuditRows } from '../lib/leaveAudit'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary, naturalLeavePeriodLabel } from '../lib/leaveRequests'
import DateFieldButton from './DateFieldButton'
import FilterPanel from './FilterPanel'
import ClearableInput from './ClearableInput'
import FloatingActionMenu from './FloatingActionMenu'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}
const CATEGORY_OPTIONS = [
  ...LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label })),
  { value: LEAVE_OTHER_COLUMN.key, label: LEAVE_OTHER_COLUMN.label },
]
const COLUMN_LABEL_BY_KEY = Object.fromEntries(CATEGORY_OPTIONS.map(o => [o.value, o.label]))
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function yearStartStr() {
  return `${new Date().getFullYear()}-01-01`
}

function BucketCell({ bucket }) {
  return (
    <div>
      <span className="font-semibold text-ink">{bucket.approved}</span>
      {bucket.pending > 0 && <span className="ml-1 text-xs text-ink-muted">+{bucket.pending} pending</span>}
    </div>
  )
}

// Admin-only HR-audit view: cumulative leave per doctor over any admin-chosen
// date range (unlike the doctor-facing "My leave" tracker, which always
// resets to the current calendar year — leave_requests rows themselves are
// never deleted or reset, this just aggregates them differently). Filterable
// by category (the same MO/Registrar/EC COSMO+Intern/OT COSMO+Intern/
// Consultant grouping the Annual Leave planner uses), doctor, active/inactive
// status, and leave type — all behind one Filter button (FilterPanel, same
// multi-select grouped-facet pattern as the Staff list) rather than four
// permanently-visible selects, since most visits don't need them.
export default function LeaveAuditReport() {
  const [dateFrom, setDateFrom] = useState(yearStartStr())
  const [dateTo, setDateTo] = useState(todayStr())
  // Each a Set of selected values — empty means "All" for that dimension
  // (see FilterPanel.jsx). Doctor is still effectively single-select in
  // practice: the drill-down below only activates when exactly one doctor
  // is selected, same as the old dedicated single-select control.
  const [categoryFilter, setCategoryFilter] = useState(new Set())
  const [doctorFilter, setDoctorFilter] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState(new Set())
  const [leaveTypeFilter, setLeaveTypeFilter] = useState(new Set())
  // Substring match on the doctor's own name, same rule every other list
  // page's search uses — the Doctor filter group is an exact multi-select
  // pick, which is a different job once the list runs to a few dozen names.
  const [q, setQ] = useState('')
  const [profiles, setProfiles] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [rotationsByDoctorId, setRotationsByDoctorId] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; only dateFrom/dateTo should trigger a refetch

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return
    setLoading(true)
    setError('')
    const [profilesRes, requestsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, category, is_active').eq('role', 'doctor').eq('is_approved', true),
      supabase.from('leave_requests').select('*').lte('date_from', dateTo).gte('date_to', dateFrom),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (requestsRes.error) { setError(requestsRes.error.message); setLoading(false); return }
    setProfiles(profilesRes.data || [])
    setLeaveRequests(requestsRes.data || [])

    try {
      const rotations = await fetchInternRotationsForDoctorIds((profilesRes.data || []).map(p => p.id))
      setRotationsByDoctorId(groupRotationsByDoctorId(rotations))
    } catch {
      setRotationsByDoctorId(new Map()) // degrades to static category bucketing below
    }

    setLoading(false)
  }

  // This is an aggregate report (one row per doctor for the WHOLE queried
  // range, not per leave_requests row), so there's no single leave-request
  // date_from to resolve an Intern's rotation off — the queried range's own
  // start (dateFrom) is used as the best available proxy instead, same
  // "resolve once, don't split day-by-day" spirit as everywhere else. A
  // doctor who rotated mid-range will show under whichever pool covered the
  // start of the range, not a blended read across both.
  const columnByProfileId = useMemo(
    () => new Map(profiles.map(p => [
      p.id,
      resolveLeaveCapacityColumn({ category: p.category, profileId: p.id, date: dateFrom, rotationsByDoctorId }) ?? LEAVE_OTHER_COLUMN.key,
    ])),
    [profiles, dateFrom, rotationsByDoctorId]
  )

  const statusFilteredProfiles = useMemo(
    () => profiles.filter(p => statusFilter.size === 0 || statusFilter.has(p.is_active ? 'active' : 'inactive')),
    [profiles, statusFilter]
  )

  const doctorOptions = useMemo(() => {
    const eligible = statusFilteredProfiles
      .filter(p => categoryFilter.size === 0 || categoryFilter.has(columnByProfileId.get(p.id)))
      .sort((a, b) => a.surname.localeCompare(b.surname))
    return eligible.map(p => ({ value: p.id, label: `${p.surname}, ${p.name}` }))
  }, [statusFilteredProfiles, categoryFilter, columnByProfileId])

  const typeFilteredRequests = leaveTypeFilter.size === 0
    ? leaveRequests
    : leaveRequests.filter(lr => leaveTypeFilter.has(lr.leave_type))

  const rows = useMemo(
    () => buildAuditRows(statusFilteredProfiles, typeFilteredRequests, dateFrom, dateTo),
    [statusFilteredProfiles, typeFilteredRequests, dateFrom, dateTo]
  )

  const searchTerm = q.trim().toLowerCase()
  const filteredRows = rows.filter(r => {
    if (categoryFilter.size > 0 && !categoryFilter.has(columnByProfileId.get(r.profileId))) return false
    if (doctorFilter.size > 0 && !doctorFilter.has(r.profileId)) return false
    if (searchTerm && !`${r.surname} ${r.name}`.toLowerCase().includes(searchTerm)) return false
    return true
  })

  // Drill-down only makes sense for exactly one doctor — a multi-doctor
  // selection just narrows the table above, same as every other dimension.
  const selectedDoctorId = doctorFilter.size === 1 ? [...doctorFilter][0] : null
  const drillDownRequests = selectedDoctorId
    ? typeFilteredRequests.filter(lr => lr.profile_id === selectedDoctorId).sort((a, b) => b.date_from.localeCompare(a.date_from))
    : []

  // A doctor selection from a previous category/status no longer
  // necessarily applies once either changes — clear it rather than
  // silently keeping a stale, now-irrelevant doctor selected.
  function handleCategoryChange(next) { setCategoryFilter(next); setDoctorFilter(new Set()) }
  function handleStatusChange(next) { setStatusFilter(next); setDoctorFilter(new Set()) }

  function clearFilters() {
    setCategoryFilter(new Set())
    setDoctorFilter(new Set())
    setStatusFilter(new Set())
    setLeaveTypeFilter(new Set())
    setQ('')
  }

  const filterGroups = [
    { key: 'category', label: 'Category', options: CATEGORY_OPTIONS, selected: categoryFilter, onChange: handleCategoryChange },
    { key: 'doctor', label: 'Doctor', options: doctorOptions, selected: doctorFilter, onChange: setDoctorFilter, alwaysSearchable: true },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, selected: statusFilter, onChange: handleStatusChange },
    { key: 'leaveType', label: 'Leave type', options: LEAVE_TYPE_OPTIONS, selected: leaveTypeFilter, onChange: setLeaveTypeFilter },
  ]

  const activeFilterCount = categoryFilter.size + doctorFilter.size + statusFilter.size + leaveTypeFilter.size

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Cumulative leave for HR auditing — pick any date range; this never resets, unlike the per-doctor tracker on My leave.
      </p>

      {/* The From/To range stays on the row at every width — it's what the
          report is *of*, not a way of narrowing it, same reasoning that
          keeps Weekend's month nav out of its FAB. Search and Filter are
          the narrowing controls, so below `md` they move into the FAB. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DateFieldButton label="From" value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} />
        <DateFieldButton label="To" value={dateTo} onChange={setDateTo} min={dateFrom || undefined} />
        <div className="hidden items-center gap-2 md:flex">
          <div className="w-64">
            <ClearableInput
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by surname or first name…"
              className="input-field"
              clearLabel="Clear search"
            />
          </div>
          <FilterPanel groups={filterGroups} />
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="text-sm font-medium text-accent hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <FloatingActionMenu
        search={{ value: q, onChange: setQ, placeholder: 'Search by surname or first name…' }}
        filter={{
          groups: filterGroups,
          active: activeFilterCount > 0 || Boolean(q),
          onClearAll: clearFilters,
          sheetTitle: 'Filters',
        }}
      />

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}
      {!loading && !error && (!dateFrom || !dateTo) && <p className="mt-6 text-sm text-ink-muted">Pick a From and a To date to run the report.</p>}
      {!loading && !error && dateFrom && dateTo && dateFrom > dateTo && <p className="mt-6 text-sm text-flagRed">&ldquo;From&rdquo; must be on or before &ldquo;To&rdquo;.</p>}

      {/* Both bounds, in order. The fetch already declines to run without
          them (see load); this stops the table standing there showing the
          last range's numbers under a date field that has since been
          cleared. */}
      {!loading && !error && dateFrom && dateTo && dateFrom <= dateTo && (
        <>
          {/* Same frame as Team Leave's own table and Hours Summary's grid —
              see RosterSummaryPage.jsx for the full rationale. In short:
              max-h + overflow-auto so this div is the real scroll container
              the sticky header can stick against, and `border-separate`
              with zero spacing rather than `border-collapse`, since a
              collapsed border is shared between neighbouring cells and
              owned by the table — the sticky Doctor column paints on its
              own layer, so its half of each shared line lands a device
              pixel off from the rest of the grid. Six columns of day counts
              are the same problem as eleven: the numbers say nothing
              without the name they belong to, and on a phone this table is
              wider than the screen. */}
          <div className="mt-4 max-h-[70vh] overflow-auto rounded-lg border border-slate-line">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                {/* bg-canvas-sunken on every th, not on the tr: a sticky cell
                    can't reliably inherit its row's background while it is
                    being repositioned, which shows as a seam through the
                    header during a scroll. Doctor is additionally sticky
                    left-0, and z-20 keeps that corner cell above both the
                    rest of the header and the sticky column beneath it. */}
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="sticky left-0 z-20 border-b border-r border-slate-line bg-canvas-sunken px-3 py-2">Doctor</th>
                  <th className="border-b border-slate-line bg-canvas-sunken px-3 py-2">Category</th>
                  <th className="border-b border-slate-line bg-canvas-sunken px-3 py-2">Annual</th>
                  <th className="border-b border-slate-line bg-canvas-sunken px-3 py-2">Special</th>
                  <th className="border-b border-slate-line bg-canvas-sunken px-3 py-2">Sick</th>
                  <th className="border-b border-slate-line bg-canvas-sunken px-3 py-2">Total days</th>
                </tr>
              </thead>
              {/* Row lines are `slate-hairline` on the cells themselves, not a
                  border on the <tr> — a row-level border paints lighter than a
                  cell-level one at phone pixel ratios. The last row drops its
                  own so it doesn't double up against the container's frame. */}
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-ink-muted">No doctors match these filters.</td></tr>
                ) : filteredRows.map(row => (
                  <tr key={row.profileId} className="hover:bg-canvas-sunken/50">
                    {/* Sticky, so the name stays put while the day counts
                        scroll past it — with its own explicit background for
                        the same reason the header cells carry theirs. */}
                    <td className="sticky left-0 z-[1] border-b border-b-slate-hairline border-r border-r-slate-line bg-canvas px-3 py-2 text-ink hover:bg-canvas-sunken/50">
                      {row.surname}, {row.name}
                    </td>
                    <td className="border-b border-slate-hairline px-3 py-2 text-ink-muted">{COLUMN_LABEL_BY_KEY[columnByProfileId.get(row.profileId)]}</td>
                    <td className="border-b border-slate-hairline px-3 py-2"><BucketCell bucket={row.annual} /></td>
                    <td className="border-b border-slate-hairline px-3 py-2"><BucketCell bucket={row.special} /></td>
                    <td className="border-b border-slate-hairline px-3 py-2"><BucketCell bucket={row.sick} /></td>
                    <td className="border-b border-slate-hairline px-3 py-2 font-semibold text-ink">{row.totalApprovedDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedDoctorId && (
            <div className="mt-4 card p-4">
              <h3 className="text-sm font-semibold text-ink">Individual requests in range</h3>
              {drillDownRequests.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No leave requests in this range.</p>
              ) : (
                <div className="mt-2 divide-y divide-slate-line">
                  {drillDownRequests.map(lr => (
                    <div key={lr.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div>
                        <p className="text-ink">{LEAVE_TYPE_LABELS[lr.leave_type]} — {naturalLeavePeriodLabel(lr.date_from, lr.date_to)}</p>
                        {annualDaysSummary(lr) && <p className="text-xs text-ink-muted">{annualDaysSummary(lr)}</p>}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
                        {reviewStatusLabel(lr.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
