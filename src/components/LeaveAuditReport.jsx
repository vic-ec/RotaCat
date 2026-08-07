import { useEffect, useMemo, useState } from 'react'
import { Tag, Stethoscope, Activity, ListFilter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn, fetchInternRotationsForDoctorIds, groupRotationsByDoctorId } from '../lib/internRotations'
import { buildAuditRows } from '../lib/leaveAudit'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary } from '../lib/leaveRequests'
import DateFieldButton from './DateFieldButton'
import { ToolbarFacet } from './Toolbar'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}
const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  ...LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label })),
  { value: LEAVE_OTHER_COLUMN.key, label: LEAVE_OTHER_COLUMN.label },
]
const COLUMN_LABEL_BY_KEY = Object.fromEntries(CATEGORY_OPTIONS.filter(o => o.value !== 'all').map(o => [o.value, o.label]))
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]
const LEAVE_TYPE_FILTER_OPTIONS = [{ value: 'all', label: 'All leave types' }, ...LEAVE_TYPE_OPTIONS]

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
// status, and leave type — each its own single-select quick-select facet
// (ToolbarFacet, same shape as every other filter row in the app) rather
// than four permanently-visible selects, since most visits don't need them.
export default function LeaveAuditReport() {
  const [dateFrom, setDateFrom] = useState(yearStartStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [doctorFilter, setDoctorFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all')
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
    () => profiles.filter(p => statusFilter === 'all' || (statusFilter === 'active') === Boolean(p.is_active)),
    [profiles, statusFilter]
  )

  const doctorOptions = useMemo(() => {
    const eligible = statusFilteredProfiles
      .filter(p => categoryFilter === 'all' || columnByProfileId.get(p.id) === categoryFilter)
      .sort((a, b) => a.surname.localeCompare(b.surname))
    return [{ value: 'all', label: 'All doctors' }, ...eligible.map(p => ({ value: p.id, label: `${p.surname}, ${p.name}` }))]
  }, [statusFilteredProfiles, categoryFilter, columnByProfileId])

  const typeFilteredRequests = leaveTypeFilter === 'all' ? leaveRequests : leaveRequests.filter(lr => lr.leave_type === leaveTypeFilter)

  const rows = useMemo(
    () => buildAuditRows(statusFilteredProfiles, typeFilteredRequests, dateFrom, dateTo),
    [statusFilteredProfiles, typeFilteredRequests, dateFrom, dateTo]
  )

  const filteredRows = rows.filter(r => {
    if (categoryFilter !== 'all' && columnByProfileId.get(r.profileId) !== categoryFilter) return false
    if (doctorFilter !== 'all' && r.profileId !== doctorFilter) return false
    return true
  })

  const drillDownRequests = doctorFilter === 'all'
    ? []
    : typeFilteredRequests.filter(lr => lr.profile_id === doctorFilter).sort((a, b) => b.date_from.localeCompare(a.date_from))

  // A doctor filter from a previous category/status no longer necessarily
  // applies once either changes — clear it rather than silently showing a
  // stale single-doctor drill-down that doesn't match the new filters.
  function handleCategoryChange(value) { setCategoryFilter(value); setDoctorFilter('all') }
  function handleStatusChange(value) { setStatusFilter(value); setDoctorFilter('all') }

  function clearFilters() {
    setCategoryFilter('all')
    setDoctorFilter('all')
    setStatusFilter('all')
    setLeaveTypeFilter('all')
  }

  const activeFilterCount = [categoryFilter, doctorFilter, statusFilter, leaveTypeFilter].filter(v => v !== 'all').length

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Cumulative leave for HR auditing — pick any date range; this never resets, unlike the per-doctor tracker on My leave.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DateFieldButton label="From" value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} />
        <DateFieldButton label="To" value={dateTo} onChange={setDateTo} min={dateFrom || undefined} />
        <ToolbarFacet
          icon={<Tag className="h-4 w-4" />}
          label="Category"
          value={categoryFilter}
          onChange={handleCategoryChange}
          options={CATEGORY_OPTIONS}
          isActive={categoryFilter !== 'all'}
        />
        <ToolbarFacet
          icon={<Stethoscope className="h-4 w-4" />}
          label="Doctor"
          value={doctorFilter}
          onChange={setDoctorFilter}
          options={doctorOptions}
          isActive={doctorFilter !== 'all'}
        />
        <ToolbarFacet
          icon={<Activity className="h-4 w-4" />}
          label="Status"
          value={statusFilter}
          onChange={handleStatusChange}
          options={STATUS_OPTIONS}
          isActive={statusFilter !== 'all'}
        />
        <ToolbarFacet
          icon={<ListFilter className="h-4 w-4" />}
          label="Leave type"
          value={leaveTypeFilter}
          onChange={setLeaveTypeFilter}
          options={LEAVE_TYPE_FILTER_OPTIONS}
          isActive={leaveTypeFilter !== 'all'}
        />
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearFilters} className="text-sm font-medium text-accent hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}
      {!loading && !error && dateFrom > dateTo && <p className="mt-6 text-sm text-flagRed">&ldquo;From&rdquo; must be on or before &ldquo;To&rdquo;.</p>}

      {!loading && !error && dateFrom <= dateTo && (
        <>
          <div className="mt-4 card overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-line text-left text-xs text-ink-muted">
                  <th className="px-3 py-2 font-medium">Doctor</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Annual</th>
                  <th className="px-3 py-2 font-medium">Special</th>
                  <th className="px-3 py-2 font-medium">Sick</th>
                  <th className="px-3 py-2 font-medium">Total days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-line">
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-ink-muted">No doctors match these filters.</td></tr>
                ) : filteredRows.map(row => (
                  <tr key={row.profileId}>
                    <td className="px-3 py-2 text-ink">{row.surname}, {row.name}</td>
                    <td className="px-3 py-2 text-ink-muted">{COLUMN_LABEL_BY_KEY[columnByProfileId.get(row.profileId)]}</td>
                    <td className="px-3 py-2"><BucketCell bucket={row.annual} /></td>
                    <td className="px-3 py-2"><BucketCell bucket={row.special} /></td>
                    <td className="px-3 py-2"><BucketCell bucket={row.sick} /></td>
                    <td className="px-3 py-2 font-semibold text-ink">{row.totalApprovedDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {doctorFilter !== 'all' && (
            <div className="mt-4 card p-4">
              <h3 className="text-sm font-semibold text-ink">Individual requests in range</h3>
              {drillDownRequests.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No leave requests in this range.</p>
              ) : (
                <div className="mt-2 divide-y divide-slate-line">
                  {drillDownRequests.map(lr => (
                    <div key={lr.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div>
                        <p className="text-ink">{LEAVE_TYPE_LABELS[lr.leave_type]} — {lr.date_from} → {lr.date_to}</p>
                        {annualDaysSummary(lr) && <p className="text-xs text-ink-muted">{annualDaysSummary(lr)}</p>}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
                        {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
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
