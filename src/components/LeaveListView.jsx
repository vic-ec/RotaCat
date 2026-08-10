import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, ArrowUpDown, CircleX, CalendarClock, CalendarCheck, LayoutGrid, Table2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, columnForLeaveCategory, labelForLeaveCategory } from '../lib/leaveYearGrid'
import { LEAVE_TYPE_LABELS, formatDMY, formatDateTime, totalCalendarDays, totalLeaveDays } from '../lib/leaveMatrix'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import ClearableInput from './ClearableInput'
import { ToolbarFacet } from './Toolbar'
import FilterPanel from './FilterPanel'
import ViewToggle from './ViewToggle'
import LeaveMatrix from './LeaveMatrix'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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

const VIEW_OPTIONS = [
  { key: 'matrix', label: 'Matrix', icon: LayoutGrid },
  { key: 'table', label: 'Table', icon: Table2 },
]

function sortRequests(list, sortMode) {
  const sorted = [...list]
  if (sortMode === 'date_asc') sorted.sort((a, b) => a.date_from.localeCompare(b.date_from))
  else if (sortMode === 'leave_type') sorted.sort((a, b) => (LEAVE_TYPE_LABELS[a.leave_type] || '').localeCompare(LEAVE_TYPE_LABELS[b.leave_type] || ''))
  else if (sortMode === 'status') sorted.sort((a, b) => (STATUS_SORT_ORDER[a.status] ?? 9) - (STATUS_SORT_ORDER[b.status] ?? 9))
  else sorted.sort((a, b) => b.date_from.localeCompare(a.date_from)) // date_desc, the default — matches the query's own order
  return sorted
}

function categoryLabel(lr) {
  return lr.profiles?.category ? labelForLeaveCategory(lr.profiles.category, lr.profiles.contract_type) : '—'
}

// Icon-only trigger for a timestamp cell (Date Requested/Date Approved) —
// keeps the grid's rows compact instead of spelling out "DD-MM-YYYY at
// HH:MM" in every cell. Click opens a small fixed-positioned popover with
// the full date+time, dismissed the same standard way as every other
// popover in the app (outside click or Escape — see useDismissablePopover).
// Portal-rendered to <body> like FilterPanel's own menu, so it isn't
// clipped by the grid's overflow-x-auto scroll container.
function DateTimePopoverButton({ iso, Icon, label }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  function close() {
    setOpen(false)
    setAnchorRect(null)
  }
  useDismissablePopover(open, close, panelRef, [triggerRef])

  if (!iso) return <span className="text-ink-muted">—</span>

  function toggle() {
    if (open) { close(); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const panelWidth = 190
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, panelWidth) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink"
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          style={{ ...positionStyle, width: panelWidth }}
          className="fixed z-50 rounded-xl border border-slate-line bg-canvas-raised px-3 py-2 text-sm font-medium text-ink shadow-raised"
        >
          {formatDateTime(iso)}
        </div>,
        document.body
      )}
    </>
  )
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
  const [view, setView] = useState('matrix')
  // Every filter dimension but q is a Set of selected values — empty means
  // "All" for that dimension (see FilterPanel.jsx).
  const [filters, setFilters] = useState({
    q: '', name: new Set(), category: new Set(), leaveType: new Set(), month: new Set(), year: new Set(), status: new Set(), admin: new Set(),
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*, profiles!leave_requests_profile_id_fkey(name, surname, category, contract_type, color_code, avatar_url, pattern_type), reviewer:profiles!leave_requests_reviewed_by_fkey(name, surname)')
      .order('date_from', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRequests(data || [])
    setLoading(false)
  }

  function setFilterDimension(key, nextSet) {
    setFilters(f => ({ ...f, [key]: nextSet }))
  }

  function clearAllFilters() {
    setFilters({
      q: '', name: new Set(), category: new Set(), leaveType: new Set(), month: new Set(), year: new Set(), status: new Set(), admin: new Set(),
    })
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

  const monthOptions = [...new Set(requests.map(r => r.date_from?.slice(5, 7)).filter(Boolean))]
    .sort()
    .map(m => ({ value: m, label: MONTH_NAMES[Number(m) - 1] }))

  const yearOptions = [...new Set(requests.map(r => r.date_from?.slice(0, 4)).filter(Boolean))]
    .sort()
    .reverse()
    .map(y => ({ value: y, label: y }))

  // Primary items match the grid's own column headers; secondary items are
  // each column's meaningful discrete values (e.g. Status → Approved /
  // Pending / Rejected) — Month/Year proxy the From/To date columns, which
  // have no sensible discrete set of their own; the day-count columns
  // likewise stay search/sort-only, not filter dimensions.
  const filterGroups = [
    { key: 'name', label: 'Name', options: nameOptions, selected: filters.name, onChange: next => setFilterDimension('name', next) },
    { key: 'category', label: 'Category', options: CATEGORY_OPTIONS, selected: filters.category, onChange: next => setFilterDimension('category', next) },
    { key: 'leaveType', label: 'Leave Type', options: LEAVE_TYPE_OPTIONS, selected: filters.leaveType, onChange: next => setFilterDimension('leaveType', next) },
    { key: 'month', label: 'Month', options: monthOptions, selected: filters.month, onChange: next => setFilterDimension('month', next) },
    { key: 'year', label: 'Year', options: yearOptions, selected: filters.year, onChange: next => setFilterDimension('year', next) },
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
    if (filters.month.size > 0 && !filters.month.has(lr.date_from?.slice(5, 7))) return false
    if (filters.year.size > 0 && !filters.year.has(lr.date_from?.slice(0, 4))) return false
    if (filters.status.size > 0 && !filters.status.has(lr.status)) return false
    if (filters.admin.size > 0 && !filters.admin.has(lr.reviewed_by)) return false
    return true
  })
  const displayedRequests = sortRequests(filteredRequests, sortMode)
  const filtersActive = Boolean(filters.q) || filters.name.size > 0 || filters.category.size > 0 || filters.leaveType.size > 0 ||
    filters.month.size > 0 || filters.year.size > 0 || filters.status.size > 0 || filters.admin.size > 0

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <ViewToggle view={view} onChange={setView} options={VIEW_OPTIONS} />
      </div>

      {view === 'matrix' && <LeaveMatrix requests={requests} />}

      {view === 'table' && (
      <>
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
              <tr className="border-b border-slate-line bg-canvas-cool text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Leave Type</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Total Calendar Days</th>
                <th className="px-3 py-2">Total Leave Days</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Date Requested</th>
                <th className="px-3 py-2">Date Approved</th>
                <th className="px-3 py-2">Approved By</th>
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
                  <td className="px-3 py-2">
                    <DateTimePopoverButton iso={lr.created_at} Icon={CalendarClock} label="View date and time requested" />
                  </td>
                  <td className="px-3 py-2">
                    <DateTimePopoverButton iso={lr.reviewed_at} Icon={CalendarCheck} label="View date and time approved" />
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{lr.reviewer ? `${lr.reviewer.name} ${lr.reviewer.surname}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </div>
  )
}
