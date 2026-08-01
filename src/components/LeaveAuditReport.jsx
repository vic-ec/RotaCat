import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, columnForLeaveCategory } from '../lib/leaveYearGrid'
import { buildAuditRows } from '../lib/leaveAudit'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary } from '../lib/leaveRequests'
import SelectMenu from './SelectMenu'

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
// by category (the same MO/Registrar/EC COSMO+Intern/OT COSMO+Intern/Other
// grouping the Annual Leave planner uses) and drillable down to one doctor's
// individual request list.
export default function LeaveAuditReport() {
  const [dateFrom, setDateFrom] = useState(yearStartStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [doctorFilter, setDoctorFilter] = useState('all')
  const [profiles, setProfiles] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; only dateFrom/dateTo should trigger a refetch

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return
    setLoading(true)
    setError('')
    const [profilesRes, requestsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, category').eq('role', 'doctor').eq('is_approved', true),
      supabase.from('leave_requests').select('*').lte('date_from', dateTo).gte('date_to', dateFrom),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (requestsRes.error) { setError(requestsRes.error.message); setLoading(false); return }
    setProfiles(profilesRes.data || [])
    setLeaveRequests(requestsRes.data || [])
    setLoading(false)
  }

  const columnByProfileId = useMemo(
    () => new Map(profiles.map(p => [p.id, columnForLeaveCategory(p.category) ?? LEAVE_OTHER_COLUMN.key])),
    [profiles]
  )

  const doctorOptions = useMemo(() => {
    const eligible = profiles
      .filter(p => categoryFilter === 'all' || columnByProfileId.get(p.id) === categoryFilter)
      .sort((a, b) => a.surname.localeCompare(b.surname))
    return [{ value: 'all', label: 'All doctors' }, ...eligible.map(p => ({ value: p.id, label: `${p.surname}, ${p.name}` }))]
  }, [profiles, categoryFilter, columnByProfileId])

  const rows = useMemo(() => buildAuditRows(profiles, leaveRequests, dateFrom, dateTo), [profiles, leaveRequests, dateFrom, dateTo])

  const filteredRows = rows.filter(r => {
    if (categoryFilter !== 'all' && columnByProfileId.get(r.profileId) !== categoryFilter) return false
    if (doctorFilter !== 'all' && r.profileId !== doctorFilter) return false
    return true
  })

  const drillDownRequests = doctorFilter === 'all'
    ? []
    : leaveRequests.filter(lr => lr.profile_id === doctorFilter).sort((a, b) => b.date_from.localeCompare(a.date_from))

  function handleCategoryChange(value) {
    setCategoryFilter(value)
    // A doctor filter from the previous category no longer applies once the
    // category changes — clear it rather than silently showing a stale
    // single-doctor drill-down that doesn't match the new category filter.
    setDoctorFilter('all')
  }

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Cumulative leave for HR auditing — pick any date range; this never resets, unlike the per-doctor tracker on My leave.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-date-from" className="label-text">From</label>
          <input id="audit-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field" />
        </div>
        <div>
          <label htmlFor="audit-date-to" className="label-text">To</label>
          <input id="audit-date-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className="input-field" />
        </div>
        <div className="w-44">
          <label className="label-text">Category</label>
          <SelectMenu value={categoryFilter} onChange={handleCategoryChange} options={CATEGORY_OPTIONS} />
        </div>
        <div className="w-56">
          <label className="label-text">Doctor</label>
          <SelectMenu value={doctorFilter} onChange={setDoctorFilter} options={doctorOptions} />
        </div>
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
