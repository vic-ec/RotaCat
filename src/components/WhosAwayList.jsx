import { useMemo, useState } from 'react'
import { List } from 'lucide-react'
import Toolbar from './Toolbar'
import LegendSheet from './LegendSheet'
import ProfileAvatar from './ProfileAvatar'
import LeaveTypeIcon, { LeaveTypePill } from './LeaveTypeIcon'
import { useIsDesktop } from '../lib/useIsDesktop'
import FloatingActionMenu from './FloatingActionMenu'
import SectionBar from './SectionBar'
import Modal from './Modal'
import LeaveBlockDetail from './LeaveBlockDetail'
import { todayStr, formatShortDateRange } from '../lib/dateRange'
import { LEAVE_GROUP_OPTIONS, LEAVE_TYPE_LABELS, leaveTypeGroupKey } from '../lib/leaveMatrix'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, columnForLeaveCategory, labelForLeaveCategory } from '../lib/leaveYearGrid'
import { groupWhosAway, shortWeekdayDate, whosAwayWhen } from '../lib/whosAway'

const CATEGORY_OPTIONS = [
  ...LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label })),
  { value: LEAVE_OTHER_COLUMN.key, label: LEAVE_OTHER_COLUMN.label },
]
const LEAVE_TYPE_FILTER_OPTIONS = LEAVE_GROUP_OPTIONS.map(o => ({ value: o.key, label: o.label }))
const EMPTY_FILTERS = { category: new Set(), leaveType: new Set() }

const EMPTY_TEXT = {
  today: 'Nobody away today',
  next7: 'Nobody starting leave',
  next14: 'Nobody starting leave',
  later: 'Nothing further ahead',
}

// Team Leave → Current & Upcoming, as a list: approved leave that hasn't
// ended, grouped Away today / Next 7 days / Next 2 weeks / Later (see
// lib/whosAway.js). From md the toolbar leads with Capture leave, then
// search, Filter, the Legend and `controls` (the Matrix / Who's away
// switch, wide screens only); below md Capture stays above the list and
// search and Filter are the FAB's. From md each row reads as columns (Name
// · Category · Leave · Dates); a phone keeps the two-line row. A row opens
// the leave's details: in a sticky panel at the right on a wide screen (the
// Matrix's, the same width), in a window below that; an admin can cancel
// it there.

// The leave groups' colours and icons, behind one icon (as on the Matrix).
function Legend() {
  return (
    <LegendSheet
      title="Legend"
      trigger={onClick => (
        <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-utility h-[30px] w-[30px] flex-shrink-0 p-0"><List className="h-4 w-4" /></button>
      )}
    >
      <div className="flex flex-col gap-2 text-sm text-ink">
        {LEAVE_GROUP_OPTIONS.map(o => (
          <span key={o.key} className="flex items-center gap-2"><LeaveTypeIcon groupKey={o.key} size="sm" />{o.label}</span>
        ))}
      </div>
    </LegendSheet>
  )
}

const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.7fr)] md:items-center md:gap-3'

// One person away: columns from md, the two-line row on a phone.
function AwayRow({ lr, groupKey, selected, onClick }) {
  const name = `${lr.profiles?.name || ''} ${lr.profiles?.surname || ''}`.trim()
  const category = lr.profiles?.category ? labelForLeaveCategory(lr.profiles.category, lr.profiles.contract_type) : ''
  const when = groupKey === 'today'
    ? `${formatShortDateRange(lr.date_from, lr.date_to)} · ${whosAwayWhen(lr, groupKey)}`
    : whosAwayWhen(lr, groupKey)
  const label = LEAVE_TYPE_LABELS[lr.leave_type] || 'Leave'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected || undefined}
      aria-label={`${name}, ${label}, ${when}`}
      data-testid="away-row"
      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-canvas-sunken ${ROW_GRID} ${selected ? 'bg-accent-tint' : ''}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex-shrink-0 md:hidden"><ProfileAvatar profile={lr.profiles} size={40} /></span>
        <span className="hidden flex-shrink-0 md:block"><ProfileAvatar profile={lr.profiles} size={30} /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{name}</span>
          {/* Phone: the leave and its dates under the name. */}
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-muted md:hidden">
            <LeaveTypePill leaveType={lr.leave_type} className="text-[11px]" />
            <span className="truncate">{when}</span>
          </span>
        </span>
      </span>
      <span className="hidden truncate text-sm text-ink-muted md:block" data-testid="away-category">{category}</span>
      {/* The leave as the details panel shows it: the tinted icon box and
          the type's name. */}
      <span className="hidden min-w-0 items-center gap-1.5 md:flex">
        <LeaveTypeIcon leaveType={lr.leave_type} size="sm" />
        <span className="truncate text-sm text-ink">{label}</span>
      </span>
      <span className="hidden truncate text-sm text-ink md:block">{when}</span>
    </button>
  )
}
export default function WhosAwayList({ requests, leading = null, controls = null, canCancelLeave = false, onLeaveCancelled }) {
  const today = todayStr()
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [collapsed, setCollapsed] = useState({ later: true })
  const [detail, setDetail] = useState(null)
  const wide = useIsDesktop(1024)

  const filtered = useMemo(() => {
    const nameQ = q.trim().toLowerCase()
    return requests.filter(r => {
      if (nameQ) {
        const full = `${r.profiles?.surname || ''} ${r.profiles?.name || ''}`.toLowerCase()
        if (!full.includes(nameQ)) return false
      }
      if (filters.leaveType.size && !filters.leaveType.has(leaveTypeGroupKey(r.leave_type))) return false
      if (filters.category.size) {
        const col = r.profiles?.category ? columnForLeaveCategory(r.profiles.category, r.profiles.contract_type) : null
        if (!col || !filters.category.has(col)) return false
      }
      return true
    })
  }, [requests, filters, q])
  const groups = groupWhosAway(filtered, today)

  const setDim = (key, next) => setFilters(f => ({ ...f, [key]: next }))
  const filterGroups = [
    { key: 'category', label: 'Category', options: CATEGORY_OPTIONS, selected: filters.category, onChange: n => setDim('category', n) },
    { key: 'leaveType', label: 'Leave type', options: LEAVE_TYPE_FILTER_OPTIONS, selected: filters.leaveType, onChange: n => setDim('leaveType', n) },
  ]
  const active = Boolean(q) || filters.category.size > 0 || filters.leaveType.size > 0
  const clearAll = () => { setFilters(EMPTY_FILTERS); setQ('') }

  return (
    <div>
      <div className="hidden items-start gap-2 md:flex">
        {leading}
        <div className="min-w-0 flex-1">
          <Toolbar
            className=""
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder="Search by surname or first name…"
            filterGroups={filterGroups}
            mobileMode="inline"
            active={active}
            onClearAll={clearAll}
            trailing={<div className="flex items-center gap-2"><Legend />{controls}</div>}
          />
        </div>
      </div>
      {/* Phone: Capture stays above the list, not in the FAB. */}
      {leading && <div className="flex items-center gap-2 md:hidden">{leading}<span className="ml-auto"><Legend /></span></div>}

      <FloatingActionMenu
        search={{ value: q, onChange: setQ, placeholder: 'Search name' }}
        filter={{ groups: filterGroups, active, onClearAll: clearAll, sheetTitle: 'Filters' }}
      />

      <div className="mt-4 flex items-start gap-4 md:mt-5">
      <div className="min-w-0 flex-1 space-y-3">
        {groups.map(g => {
          const isCollapsed = Boolean(collapsed[g.key])
          const label = g.key === 'today' ? `${g.label} · ${shortWeekdayDate(today)}` : g.label
          return (
            <section key={g.key} aria-label={g.label}>
              <SectionBar
                label={label}
                count={g.items.length}
                collapsed={isCollapsed}
                onToggle={() => setCollapsed(c => ({ ...c, [g.key]: !isCollapsed }))}
              />
              {!isCollapsed && (
                <div className="card mt-2 divide-y divide-slate-line overflow-hidden">
                  {g.items.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-ink-muted">{active ? 'No one matches these filters' : EMPTY_TEXT[g.key]}</p>
                  ) : (
                    <>
                      <div className={`hidden px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted ${ROW_GRID}`} aria-hidden="true">
                        <span>Name</span><span>Category</span><span>Leave</span><span>Dates</span>
                      </div>
                      {g.items.map(lr => (
                        <AwayRow key={lr.id} lr={lr} groupKey={g.key} selected={detail?.id === lr.id} onClick={() => setDetail(d => (d?.id === lr.id && wide ? null : lr))} />
                      ))}
                    </>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
      {/* Wide screens: the selected leave in a sticky panel, the Matrix's. */}
      {wide && (
        <aside className="sticky top-4 w-72 flex-shrink-0" data-testid="away-panel">
          <div className="card max-h-[calc(100dvh-2rem)] overflow-y-auto p-4">
            {detail ? (
              <LeaveBlockDetail
                request={detail}
                onClose={() => setDetail(null)}
                showClose
                canCancel={canCancelLeave}
                onCancelled={row => { setDetail(null); onLeaveCancelled?.(row) }}
              />
            ) : (
              <p className="text-sm text-ink-muted">Select a row to see its leave.</p>
            )}
          </div>
        </aside>
      )}
      </div>

      {detail && !wide && (
        <Modal title="Leave details" onClose={() => setDetail(null)}>
          <LeaveBlockDetail
            request={detail}
            canCancel={canCancelLeave}
            onCancelled={row => { setDetail(null); onLeaveCancelled?.(row) }}
          />
        </Modal>
      )}
    </div>
  )
}
