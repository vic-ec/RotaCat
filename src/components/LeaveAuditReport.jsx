import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn, fetchInternRotationsForDoctorIds, groupRotationsByDoctorId } from '../lib/internRotations'
import { buildAuditRows } from '../lib/leaveAudit'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary } from '../lib/leaveRequests'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import DateFieldButton from './DateFieldButton'

function FilterIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}

function ChevronDownIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

// Mirrors StaffListPage's local flyout-position helper (rolls down only,
// unlike computeAnchoredPosition's up/down flip) — kept local here too
// since it's a small cascading-menu detail, not shared app-wide logic.
function computeFlyoutPosition(anchorRect, width) {
  const vw = window.innerWidth
  const left = Math.min(Math.max(8, anchorRect.right - width), vw - width - 8)
  return { left, top: anchorRect.bottom + 6 }
}

function FilterRow({ label, expanded, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken ${
        expanded ? 'font-semibold text-ink' : 'font-medium text-ink'
      }`}
    >
      <span className="flex-1">{label}</span>
      <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
  )
}

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
// status, and leave type — all tucked behind a single Filter toggle rather
// than four permanently-visible selects, since most visits don't need them.
export default function LeaveAuditReport() {
  const [dateFrom, setDateFrom] = useState(yearStartStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterAnchor, setFilterAnchor] = useState(null)
  const filterMenuRef = useRef(null)
  const [filterSecondaryFor, setFilterSecondaryFor] = useState(null) // null | 'category' | 'doctor' | 'status' | 'leaveType'
  const [filterSecondaryAnchor, setFilterSecondaryAnchor] = useState(null)
  const filterSecondaryMenuRef = useRef(null)
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

  function openFilters(anchorEl) {
    setFilterAnchor(anchorEl.getBoundingClientRect())
    setFiltersOpen(true)
  }
  function closeFilters() {
    setFiltersOpen(false)
    setFilterAnchor(null)
    setFilterSecondaryFor(null)
    setFilterSecondaryAnchor(null)
  }
  // Picking the same filter dimension again closes its options flyout;
  // picking another swaps to it — same cascade as Staff list's Filter popover.
  function toggleFilterSecondary(key, anchorEl) {
    setFilterSecondaryFor(s => {
      if (s === key) { setFilterSecondaryAnchor(null); return null }
      setFilterSecondaryAnchor(anchorEl.getBoundingClientRect())
      return key
    })
  }

  useDismissablePopover(filtersOpen, closeFilters, filterMenuRef, [filterSecondaryMenuRef])

  const activeFilterCount = [categoryFilter, doctorFilter, statusFilter, leaveTypeFilter].filter(v => v !== 'all').length

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Cumulative leave for HR auditing — pick any date range; this never resets, unlike the per-doctor tracker on My leave.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DateFieldButton label="From" value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} />
        <DateFieldButton label="To" value={dateTo} onChange={setDateTo} min={dateFrom || undefined} />
        <button
          type="button"
          onClick={e => (filtersOpen ? closeFilters() : openFilters(e.currentTarget))}
          aria-haspopup="menu"
          aria-expanded={filtersOpen}
          aria-label="Filters"
          className={`relative flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border transition-colors ${
            filtersOpen ? 'border-accent bg-accent-tint text-accent' : 'border-slate-line text-ink-muted hover:bg-canvas-sunken hover:text-ink'
          }`}
        >
          <FilterIcon className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Filter popover (primary) — Category/Doctor/Status/Leave type,
           each opening its own options flyout, matching the Staff list
           page's cascading Filter popup (computeAnchoredPosition +
           useDismissablePopover, close-on-outside-click muting the
           background). ── */}
      {filtersOpen && filterAnchor && (() => {
        const menuWidth = 220
        const positionStyle = computeAnchoredPosition(filterAnchor, menuWidth)
        const categoryLabel = CATEGORY_OPTIONS.find(o => o.value === categoryFilter)?.label
        const doctorLabel = doctorOptions.find(o => o.value === doctorFilter)?.label
        const statusLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label
        const leaveTypeLabel = LEAVE_TYPE_FILTER_OPTIONS.find(o => o.value === leaveTypeFilter)?.label
        return (
          <div
            ref={filterMenuRef}
            role="menu"
            style={{ ...positionStyle, width: menuWidth }}
            className="fixed z-50 overflow-hidden rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
          >
            <FilterRow label={`Category · ${categoryLabel}`} expanded={filterSecondaryFor === 'category'} onClick={e => toggleFilterSecondary('category', e.currentTarget)} />
            <FilterRow label={`Doctor · ${doctorLabel}`} expanded={filterSecondaryFor === 'doctor'} onClick={e => toggleFilterSecondary('doctor', e.currentTarget)} />
            <FilterRow label={`Status · ${statusLabel}`} expanded={filterSecondaryFor === 'status'} onClick={e => toggleFilterSecondary('status', e.currentTarget)} />
            <FilterRow label={`Leave type · ${leaveTypeLabel}`} expanded={filterSecondaryFor === 'leaveType'} onClick={e => toggleFilterSecondary('leaveType', e.currentTarget)} />
            {activeFilterCount > 0 && (
              <div className="mt-1 border-t border-slate-line px-4 pt-2">
                <button
                  type="button"
                  onClick={() => { clearFilters(); setFilterSecondaryFor(null) }}
                  className="flex items-center gap-1.5 py-1 text-xs font-medium text-ink-light hover:text-ink"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Filter secondary flyout — cascades beside whichever dimension
           row was tapped. ── */}
      {filtersOpen && filterSecondaryFor && filterSecondaryAnchor && (() => {
        const menuWidth = 200
        const positionStyle = computeFlyoutPosition(filterSecondaryAnchor, menuWidth)
        const optionSets = {
          category: CATEGORY_OPTIONS,
          doctor: doctorOptions,
          status: STATUS_OPTIONS,
          leaveType: LEAVE_TYPE_FILTER_OPTIONS,
        }
        const currentValues = { category: categoryFilter, doctor: doctorFilter, status: statusFilter, leaveType: leaveTypeFilter }
        const setters = { category: handleCategoryChange, doctor: setDoctorFilter, status: handleStatusChange, leaveType: setLeaveTypeFilter }
        const options = optionSets[filterSecondaryFor]
        const currentValue = currentValues[filterSecondaryFor]
        const setValue = setters[filterSecondaryFor]
        return (
          <div
            ref={filterSecondaryMenuRef}
            role="menu"
            style={{ ...positionStyle, width: menuWidth }}
            className="fixed z-50 max-h-60 overflow-y-auto rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
          >
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setValue(opt.value); setFilterSecondaryFor(null) }}
                className={`block w-full px-4 py-2 text-left text-sm transition-colors ${
                  opt.value === currentValue
                    ? 'bg-accent font-semibold text-white hover:bg-accent-dark active:bg-accent-dark'
                    : 'text-ink hover:bg-canvas-sunken active:bg-canvas-sunken'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )
      })()}

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
