import { useEffect, useState } from 'react'
import { Search, ArrowUpDown, CircleX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary } from '../lib/leaveRequests'
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

// Team-wide leave list. Intentionally has NO role-conditional filtering —
// the leave_select RLS policy already scopes rows correctly per role
// (requester sees own always; other doctors see others' only once approved;
// clerk sees all approved leave year-round now (see the Annual/Special
// planners' "All" tab, which is this same data — this tab itself is hidden
// for clerks as redundant); locum sees nothing — enforced by this route
// being locum-blocked before this ever renders; admin sees all).
// This component just renders whatever comes back, plus a client-side
// search/sort/multi-select-filter over that set (year, doctor, status,
// admin reviewer) — same search+Sort+Filter row shape as the Staff page's
// All Staff tab.
export default function LeaveListView() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortMode, setSortMode] = useState('date_desc')
  // year/doctor/status/admin are each a Set of selected values — empty
  // means "All" for that dimension (see FilterPanel.jsx).
  const [filters, setFilters] = useState({ q: '', year: new Set(), doctor: new Set(), status: new Set(), admin: new Set() })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*, profiles!leave_requests_profile_id_fkey(name, surname), reviewer:profiles!leave_requests_reviewed_by_fkey(name, surname)')
      .order('date_from', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRequests(data || [])
    setLoading(false)
  }

  function setFilterDimension(key, nextSet) {
    setFilters(f => ({ ...f, [key]: nextSet }))
  }

  function clearAllFilters() {
    setFilters({ q: '', year: new Set(), doctor: new Set(), status: new Set(), admin: new Set() })
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <p className="text-sm text-flagRed">{error}</p>
  if (requests.length === 0) return <p className="text-sm text-ink-muted">No leave requests visible to you.</p>

  const yearOptions = [...new Set(requests.map(r => r.date_from?.slice(0, 4)).filter(Boolean))].sort().reverse()

  const doctorOptions = (() => {
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

  const filterGroups = [
    { key: 'year', label: 'Year', options: yearOptions.map(y => ({ value: y, label: y })), selected: filters.year, onChange: next => setFilterDimension('year', next) },
    { key: 'doctor', label: 'Doctor', options: doctorOptions, selected: filters.doctor, onChange: next => setFilterDimension('doctor', next) },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, selected: filters.status, onChange: next => setFilterDimension('status', next) },
    { key: 'admin', label: 'Admin review', options: adminOptions, selected: filters.admin, onChange: next => setFilterDimension('admin', next) },
  ]

  const filteredRequests = requests.filter(lr => {
    const q = filters.q.trim().toLowerCase()
    if (q) {
      const fullName = `${lr.profiles?.surname || ''} ${lr.profiles?.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (filters.year.size > 0 && !filters.year.has(lr.date_from?.slice(0, 4))) return false
    if (filters.doctor.size > 0 && !filters.doctor.has(lr.profile_id)) return false
    if (filters.status.size > 0 && !filters.status.has(lr.status)) return false
    if (filters.admin.size > 0 && !filters.admin.has(lr.reviewed_by)) return false
    return true
  })
  const displayedRequests = sortRequests(filteredRequests, sortMode)
  const filtersActive = Boolean(filters.q) || filters.year.size > 0 || filters.doctor.size > 0 || filters.status.size > 0 || filters.admin.size > 0

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
        <div className="card mt-4 divide-y divide-slate-line overflow-hidden">
          {displayedRequests.map(lr => (
            <div key={lr.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-ink">{lr.profiles?.name} {lr.profiles?.surname}</p>
                <p className="text-xs text-ink-muted">{LEAVE_TYPE_LABELS[lr.leave_type]} — {lr.date_from} → {lr.date_to}</p>
                {annualDaysSummary(lr) && <p className="text-xs text-ink-muted">{annualDaysSummary(lr)}</p>}
                {lr.status !== 'pending' && lr.reviewed_at && (
                  <p className="text-xs text-ink-muted">
                    {lr.status === 'approved' ? 'Approved' : 'Rejected'} by {lr.reviewer ? `${lr.reviewer.name} ${lr.reviewer.surname}` : 'an admin'} on {new Date(lr.reviewed_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
                {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
