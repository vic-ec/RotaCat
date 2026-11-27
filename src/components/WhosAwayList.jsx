import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import Toolbar from './Toolbar'
import FloatingActionMenu from './FloatingActionMenu'
import SectionBar from './SectionBar'
import RequestRow from './RequestRow'
import Modal from './Modal'
import LeaveBlockDetail from './LeaveBlockDetail'
import { todayStr } from '../lib/dateRange'
import { LEAVE_GROUP_OPTIONS, LEAVE_TYPE_LABELS, leaveTypeGroupKey, leaveTypeInk } from '../lib/leaveMatrix'
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
// lib/whosAway.js). One layout at every width. From md the toolbar leads
// with Capture leave, then search and Filter, then `controls` (the
// Matrix / Who's away switch, wide screens only); below md those three are
// the FAB's, as on the rest of the app. A row opens the leave's details,
// where an admin can cancel it.
export default function WhosAwayList({ requests, leading = null, onCapture, controls = null, canCancelLeave = false, onLeaveCancelled }) {
  const today = todayStr()
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [collapsed, setCollapsed] = useState({ later: true })
  const [detail, setDetail] = useState(null)

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
            trailing={controls}
          />
        </div>
      </div>

      <FloatingActionMenu
        primaryAction={onCapture ? { icon: Plus, label: 'Capture leave', onClick: onCapture } : undefined}
        search={{ value: q, onChange: setQ, placeholder: 'Search name' }}
        filter={{ groups: filterGroups, active, onClearAll: clearAll, sheetTitle: 'Filters' }}
      />

      <div className="mt-4 space-y-3 md:mt-5 lg:max-w-4xl">
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
                  ) : g.items.map(lr => (
                    <RequestRow
                      key={lr.id}
                      person={lr.profiles}
                      name={`${lr.profiles?.name || ''} ${lr.profiles?.surname || ''}`.trim()}
                      meta={(
                        <>
                          <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-sm align-[1px]" style={{ backgroundColor: leaveTypeInk(lr.leave_type) }} />
                          {LEAVE_TYPE_LABELS[lr.leave_type] || 'Leave'} · {whosAwayWhen(lr, g.key)}
                        </>
                      )}
                      column={lr.profiles?.category ? labelForLeaveCategory(lr.profiles.category, lr.profiles.contract_type) : null}
                      onClick={() => setDetail(lr)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {detail && (
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
