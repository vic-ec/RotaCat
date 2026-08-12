import { useMemo, useState } from 'react'
import { CalendarRange, CalendarDays, Users, Search } from 'lucide-react'
import ViewToggle from './ViewToggle'
import FilterPanel from './FilterPanel'
import ClearableInput from './ClearableInput'
import Modal from './Modal'
import TeamLeaveDateNavigator from './TeamLeaveDateNavigator'
import TeamLeaveWeekView from './TeamLeaveWeekView'
import TeamLeaveMonthView from './TeamLeaveMonthView'
import TeamLeavePeopleView from './TeamLeavePeopleView'
import LeaveBlockDetail from './LeaveBlockDetail'
import { todayStr } from '../lib/dateRange'
import { leaveTypeGroupKey, LEAVE_GROUP_OPTIONS } from '../lib/leaveMatrix'
import { columnForLeaveCategory, LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'

const VIEW_OPTIONS = [
  { key: 'week', label: 'Week', icon: CalendarRange },
  { key: 'month', label: 'Month', icon: CalendarDays },
  { key: 'people', label: 'People', icon: Users },
]

const STATUS_OPTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
]
const LEAVE_TYPE_FILTER_OPTIONS = LEAVE_GROUP_OPTIONS.map(o => ({ value: o.key, label: o.label }))
const CATEGORY_OPTIONS = [
  ...LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label })),
  { value: LEAVE_OTHER_COLUMN.key, label: LEAVE_OTHER_COLUMN.label },
]

const EMPTY_FILTERS = { leaveType: new Set(), status: new Set(), category: new Set() }

// The mobile Team Leave surface (rendered below `lg` by LeaveListView; the
// year matrix/table stay the wide-screen coordination views). A Week / Month /
// People switch over an awareness-and-lookup experience, with on-demand
// filters that apply across all three views. Read-only — renders from the same
// `requests` the desktop views use, so there's no second fetch.
export default function TeamLeaveMobile({ requests }) {
  const today = todayStr()
  const [view, setView] = useState('week')
  const [weekAnchor, setWeekAnchor] = useState(today)
  const [monthYear, setMonthYear] = useState(Number(today.slice(0, 4)))
  const [monthMonth, setMonthMonth] = useState(Number(today.slice(5, 7)))
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState(null) // a selected leave request

  // Name search + the filter facets apply across all three views (the same
  // filtered set feeds Week, Month, and People).
  const filtered = useMemo(() => {
    const nameQ = q.trim().toLowerCase()
    return requests.filter(r => {
      if (r.status !== 'approved' && r.status !== 'pending') return false
      if (nameQ) {
        const full = `${r.profiles?.surname || ''} ${r.profiles?.name || ''}`.toLowerCase()
        if (!full.includes(nameQ)) return false
      }
      if (filters.status.size && !filters.status.has(r.status)) return false
      if (filters.leaveType.size && !filters.leaveType.has(leaveTypeGroupKey(r.leave_type))) return false
      if (filters.category.size) {
        const col = r.profiles?.category ? columnForLeaveCategory(r.profiles.category, r.profiles.contract_type) : null
        if (!col || !filters.category.has(col)) return false
      }
      return true
    })
  }, [requests, filters, q])

  const setDim = (key, next) => setFilters(f => ({ ...f, [key]: next }))
  const filterGroups = [
    { key: 'leaveType', label: 'Leave type', options: LEAVE_TYPE_FILTER_OPTIONS, selected: filters.leaveType, onChange: n => setDim('leaveType', n) },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, selected: filters.status, onChange: n => setDim('status', n) },
    { key: 'category', label: 'Category', options: CATEGORY_OPTIONS, selected: filters.category, onChange: n => setDim('category', n) },
  ]

  const chipDefs = [
    { key: 'leaveType', options: LEAVE_TYPE_FILTER_OPTIONS },
    { key: 'status', options: STATUS_OPTIONS },
    { key: 'category', options: CATEGORY_OPTIONS },
  ]
  const chips = chipDefs.flatMap(({ key, options }) =>
    [...filters[key]].map(value => ({
      id: `${key}:${value}`,
      label: options.find(o => o.value === value)?.label || value,
      remove: () => setDim(key, new Set([...filters[key]].filter(v => v !== value))),
    })))

  return (
    <div>
      <div className="flex items-center gap-2">
        <ViewToggle view={view} onChange={setView} options={VIEW_OPTIONS} />
        <div className="min-w-0 flex-1">
          <ClearableInput
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name"
            className="input-field h-[30px] py-1"
            clearLabel="Clear search"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <FilterPanel groups={filterGroups} />
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={c.remove}
              aria-label={`Remove ${c.label} filter`}
              className="inline-flex items-center gap-1 rounded-full bg-canvas-sunken px-2 py-0.5 text-xs text-ink transition-colors hover:bg-slate-line"
            >
              {c.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-ink-muted underline hover:text-ink">
            Clear all
          </button>
        </div>
      )}

      {view !== 'people' && (
        <div className="mt-3">
          <TeamLeaveDateNavigator
            view={view}
            weekAnchor={weekAnchor}
            onWeekChange={setWeekAnchor}
            year={monthYear}
            month={monthMonth}
            onMonthChange={(y, m) => { setMonthYear(y); setMonthMonth(m) }}
          />
        </div>
      )}

      {view === 'week' && <TeamLeaveWeekView requests={filtered} weekAnchor={weekAnchor} onSelectLeave={setDetail} />}
      {view === 'month' && <TeamLeaveMonthView requests={filtered} year={monthYear} month={monthMonth} onSelectLeave={setDetail} />}
      {view === 'people' && <TeamLeavePeopleView requests={filtered} onSelectLeave={setDetail} />}

      {detail && (
        <Modal title="Leave details" onClose={() => setDetail(null)}>
          <LeaveBlockDetail request={detail} />
        </Modal>
      )}
    </div>
  )
}
