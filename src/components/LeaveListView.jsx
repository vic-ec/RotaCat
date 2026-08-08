import { useEffect, useState } from 'react'
import { Search, ArrowUpDown, CircleX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { datesInRange } from '../lib/dateRange'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, columnForLeaveCategory, labelForLeaveCategory } from '../lib/leaveYearGrid'
import ClearableInput from './ClearableInput'
import { ToolbarFacet } from './Toolbar'
import FilterPanel from './FilterPanel'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

// Same MO/Registrar/EC Intern/OT Intern/Consultant grouping the Annual
// planner and Audit report use — a fixed picklist (not derived from
// whatever happens to be loaded), matching how Leave type/Status are also
// fixed picklists rather than "whatever's present today".
const CATEGORY_OPTIONS = [
  ...LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label })),
  { value: LEAVE_OTHER_COLUMN.key, label: LEAVE_OTHER_COLUMN.label },
]

// A flat Sort facet mixing a genuine two-way date sort with two grouping
// modes (leave type, status) — same "one list, several unrelated axes"
// pattern as the Staff page's own Sort facet (category/role/A–Z).
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'leave_type', label: 'Leave type' },
  { value: 'status', label: 'Status' },
]

const STATUS_SORT_ORDER = { pending: 0, approved: 1, rejected: 2 }

function sortRequests(list, sortMode) {
  const sorted = [...list]
  if (sortMode === 'date_asc') sorted.sort((a, b) => a.date_from.localeCompare(b.date_from))
  else if (sortMode === 'leave_type') sorted.sort((a, b) => (LEAVE_TYPE_LABELS[a.leave_type] || '').localeCompare(LEAVE_TYPE_LABELS[b.leave_type] || ''))
  else if (sortMode === 'status') sorted.sort((a, b) => (STATUS_SORT_ORDER[a.status] ?? 9) - (STATUS_SORT_ORDER[b.status] ?? 9))
  else sorted.sort((a, b) => b.date_from.localeCompare(a.date_from)) // date_desc, the default — matches the query's own order
  return sorted
}

// "DD-MM-YYYY" from a YYYY-MM-DD date string.
function formatDMY(dateStr) {
  return dateStr ? dateStr.split('-').reverse().join('-') : '—'
}

// "DD-MM-YYYY at HH:MM" from a full timestamp — same template as the
// pending-registration review page's "Registered X at Y" line and the
// Requests queue's own "received" line.
function formatDateTime(isoStr) {
  if (!isoStr) return null
  return `${isoStr.slice(0, 10).split('-').reverse().join('-')} at ${isoStr.slice(11, 16)}`
}

function totalCalendarDays(lr) {
  return datesInRange(lr.date_from, lr.date_to).length
}

// The days that actually count against the leave balance — for annual
// leave that's the requester-entered annual_leave_days (a padding weekend
// in the range doesn't count against it, see isValidAnnualLeaveDays);
// every other leave type has no such distinction, so its full calendar-day
// span is what's taken.
function totalLeaveDays(lr) {
  if (lr.leave_type === 'annual' && lr.annual_leave_days != null) return lr.annual_leave_days
  return totalCalendarDays(lr)
}

function categoryLabel(lr) {
  return lr.profiles?.category ? labelForLeaveCategory(lr.profiles.category, lr.profiles.contract_type) : '—'
}

// Team-wide leave list. Intentionally has NO role-conditional filtering —
// the leave_select RLS policy already scopes rows correctly per role
// (requester sees own always; other doctors see others' only once approved;
// clerk sees all approved leave year-round now (see the Annual/Special
// planners' "All" tab, which is this same data — this tab itself is hidden
// for clerks as redundant); locum sees nothing — enforced by this route
// being locum-blocked before this ever renders; admin sees all).
// This component just renders whatever comes back, plus a client-side
// search/sort/multi-select-filter over that set (name, category, leave
// type, status, approving admin) — same search+Sort+Filter row shape as
// the Staff page's All Staff tab. Filter groups mirror the grid's own
// column headers (see filterGroups below) rather than an unrelated set of
// dimensions.
export default function LeaveListView() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortMode, setSortMode] = useState('date_desc')
  // Every filter dimension but q is a Set of selected values — empty means
  // "All" for that dimension (see FilterPanel.jsx).
  const [filters, setFilters] = useState({ q: '', name: new Set(), category: new Set(), leaveType: new Set(), status: new Set(), admin: new Set() })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*, profiles!leave_requests_profile_id_fkey(name, surname, category, contract_type), reviewer:profiles!leave_requests_reviewed_by_fkey(name, surname)')
      .order('date_from', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRequests(data || [])
    setLoading(false)
  }

  function setFilterDimension(key, nextSet) {
    setFilters(f => ({ ...f, [key]: nextSet }))
  }

  function clearAllFilters() {
    setFilters({ q: '', name: new Set(), category: new Set(), leaveType: new Set(), status: new Set(), admin: new Set() })
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <p className="text-sm text-flagRed">{error}</p>
  if (requests.length === 0) return <p className="text-sm text-ink-muted">No leave requests visible to you.</p>

  const nameOptions = (() => {
    const seen = new Map()
    for (const r of requests) {
      if (r.profile_id && !seen.has(r.profile_id)) {
        seen.set(r.profile_id, `${r.profiles?.name || ''} ${r.profiles?.surname || ''}`.trim() || 'Unknown')
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  })()

  const adminOptions = (() => {
    const seen = new Map()
    for (const r of requests) {
      if (r.reviewed_by && !seen.has(r.reviewed_by)) {
        seen.set(r.reviewed_by, `${r.reviewer?.name || ''} ${r.reviewer?.surname || ''}`.trim() || 'Unknown')
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  })()

  // Primary items match the grid's own column headers; secondary items are
  // each column's meaningful discrete values (e.g. Status → Approved /
  // Pending / Rejected) — dates and day-counts have no sensible discrete
  // set, so they stay search/sort-only, not filter dimensions.
  const filterGroups = [
    { key: 'name', label: 'Name', options: nameOptions, selected: filters.name, onChange: next => setFilterDimension('name', next) },
    { key: 'category', label: 'Category', options: CATEGORY_OPTIONS, selected: filters.category, onChange: next => setFilterDimension('category', next) },
    { key: 'leaveType', label: 'Leave Type', options: LEAVE_TYPE_OPTIONS, selected: filters.leaveType, onChange: next => setFilterDimension('leaveType', next) },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, selected: filters.status, onChange: next => setFilterDimension('status', next) },
    { key: 'admin', label: 'Approved By', options: adminOptions, selected: filters.admin, onChange: next => setFilterDimension('admin', next) },
  ]

  const filteredRequests = requests.filter(lr => {
    const q = filters.q.trim().toLowerCase()
    if (q) {
      const fullName = `${lr.profiles?.surname || ''} ${lr.profiles?.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (filters.name.size > 0 && !filters.name.has(lr.profile_id)) return false
    if (filters.category.size > 0) {
      const columnKey = lr.profiles?.category ? columnForLeaveCategory(lr.profiles.category, lr.profiles.contract_type) : null
      if (!columnKey || !filters.category.has(columnKey)) return false
    }
    if (filters.leaveType.size > 0 && !filters.leaveType.has(lr.leave_type)) return false
    if (filters.status.size > 0 && !filters.status.has(lr.status)) return false
    if (filters.admin.size > 0 && !filters.admin.has(lr.reviewed_by)) return false
    return true
  })
  const displayedRequests = sortRequests(filteredRequests, sortMode)
  const filtersActive = Boolean(filters.q) || filters.name.size > 0 || filters.category.size > 0 || filters.leaveType.size > 0 || filters.status.size > 0 || filters.admin.size > 0

  return (
    <div>
      {/* Mobile toolbar */}
      <div className="flex items-center gap-2 md:hidden">
        <div className="min-w-0 flex-1">
          <ClearableInput
            type="text"
            value={filters.q}
            onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            placeholder="Search by surname or first name…"
            className="input-field h-[30px] py-1"
            clearLabel="Clear search"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <ToolbarFacet
          icon={<ArrowUpDown className="h-4 w-4" />}
          label="Sort"
          value={sortMode}
          onChange={setSortMode}
          options={SORT_OPTIONS}
          isActive={sortMode !== 'date_desc'}
        />
        <FilterPanel groups={filterGroups} />
        {filtersActive && (
          <button
            onClick={clearAllFilters}
            aria-label="Clear all filters"
            title="Clear all filters"
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border border-accent/25 bg-canvas text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-accent active:text-white"
          >
            <CircleX className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Desktop toolbar — same components, fixed widths so the row never reflows */}
      <div className="hidden items-center gap-2 md:flex">
        <div className="w-80 flex-shrink-0">
          <ClearableInput
            type="text"
            value={filters.q}
            onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            placeholder="Search by surname or first name…"
            className="input-field h-[30px] py-1"
            clearLabel="Clear search"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <ToolbarFacet
          icon={<ArrowUpDown className="h-4 w-4" />}
          label="Sort"
          value={sortMode}
          onChange={setSortMode}
          options={SORT_OPTIONS}
          isActive={sortMode !== 'date_desc'}
        />
        <FilterPanel groups={filterGroups} />
        {filtersActive && (
          <button
            onClick={clearAllFilters}
            aria-label="Clear all filters"
            title="Clear all filters"
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border border-accent/25 bg-canvas text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-accent active:text-white"
          >
            <CircleX className="h-4 w-4" />
          </button>
        )}
      </div>

      {displayedRequests.length === 0 ? (
        <div className="card mt-4 p-10 text-center">
          <p className="mb-3 text-sm text-ink-muted">No leave requests match these filters.</p>
          {filtersActive && (
            <button onClick={clearAllFilters} className="btn-secondary">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[1500px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-line text-left text-xs text-ink-muted">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Leave Type</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium">Total Calendar Days</th>
                <th className="px-3 py-2 font-medium">Total Leave Days</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Requested</th>
                <th className="px-3 py-2 font-medium">Approved By</th>
                <th className="px-3 py-2 font-medium">Date Approved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-line">
              {displayedRequests.map(lr => (
                <tr key={lr.id}>
                  <td className="px-3 py-2 font-medium text-ink">{lr.profiles?.name} {lr.profiles?.surname}</td>
                  <td className="px-3 py-2 text-ink-muted">{categoryLabel(lr)}</td>
                  <td className="px-3 py-2 text-ink-muted">{LEAVE_TYPE_LABELS[lr.leave_type] || lr.leave_type}</td>
                  <td className="px-3 py-2 text-ink-muted">{formatDMY(lr.date_from)}</td>
                  <td className="px-3 py-2 text-ink-muted">{formatDMY(lr.date_to)}</td>
                  <td className="px-3 py-2 text-ink-muted">{totalCalendarDays(lr)}</td>
                  <td className="px-3 py-2 text-ink-muted">{totalLeaveDays(lr)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
                      {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{formatDateTime(lr.created_at) || '—'}</td>
                  <td className="px-3 py-2 text-ink-muted">{lr.reviewer ? `${lr.reviewer.name} ${lr.reviewer.surname}` : '—'}</td>
                  <td className="px-3 py-2 text-ink-muted">{formatDateTime(lr.reviewed_at) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
