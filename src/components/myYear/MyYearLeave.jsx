import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import Toolbar from '../Toolbar'
import FloatingActionMenu from '../FloatingActionMenu'
import { MONTH_ABBR } from '../../lib/dateRange'
import { LEAVE_TYPE_OPTIONS } from '../../lib/leaveRequests'
import { formatShortDateRange } from '../../lib/dateRange'
import { LEAVE_TYPE_LABELS } from '../../lib/leaveRequests'
import { totalLeaveDays } from '../../lib/leaveMatrix'
import { reviewStatusLabel } from '../../lib/statusLabels'
import { leaveBucket, leaveRecordCounts, coverForRequest, coverSummary, isCountedLeave } from '../../lib/myYear'
import { rosterLinkForDate } from '../../lib/myYearData'
import { requestLink } from '../../lib/myYearLinks'
import Tag from '../Tag'
import LeaveCodeBox from './LeaveCodeBox'

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' }
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'annual', label: 'Annual' },
  { key: 'sick', label: 'Sick' },
  { key: 'other', label: 'Other' },
]
const PHONE_LIMIT = 5
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const STATUS_OPTIONS = ['approved', 'pending', 'rejected', 'cancelled'].map(v => ({ value: v, label: reviewStatusLabel(v) }))
const EMPTY = { month: new Set(), leaveType: new Set(), status: new Set() }
// Every month a request touches, as "01".."12".
function monthsOf(r) {
  const out = new Set()
  let [y, m] = r.date_from.slice(0, 7).split('-').map(Number)
  const [ey, em] = r.date_to.slice(0, 7).split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) { out.add(String(m).padStart(2, '0')); m += 1; if (m > 12) { m = 1; y += 1 } }
  return out
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const linkClass = 'font-medium text-accent hover:text-accent-dark'

export default function MyYearLeave({ rows, data, profileId, today }) {
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const [q, setQ] = useState('')
  const [facets, setFacets] = useState(EMPTY)
  const [collapsed, setCollapsed] = useState(false)
  const setFacet = (key, next) => { setFacets(f => ({ ...f, [key]: next })); setShowAll(false) }
  // The year itself is the page's year stepper; these narrow within it.
  const filterGroups = [
    { key: 'month', label: 'Month', options: MONTH_NAMES.map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label })), selected: facets.month, onChange: n => setFacet('month', n) },
    { key: 'leaveType', label: 'Leave type', options: LEAVE_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label })), selected: facets.leaveType, onChange: n => setFacet('leaveType', n) },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, selected: facets.status, onChange: n => setFacet('status', n) },
  ]
  const active = Boolean(q) || facets.month.size > 0 || facets.leaveType.size > 0 || facets.status.size > 0
  const clearAll = () => { setQ(''); setFacets(EMPTY) }

  const counts = useMemo(() => leaveRecordCounts(rows), [rows])
  const approvedDays = useMemo(() => rows.filter(isCountedLeave).reduce((s, r) => s + Number(totalLeaveDays(r)), 0), [rows])
  const items = useMemo(() => rows
    .filter(r => filter === 'all' || leaveBucket(r.leave_type) === filter)
    .filter(r => !facets.leaveType.size || facets.leaveType.has(r.leave_type))
    .filter(r => !facets.status.size || facets.status.has(r.status))
    .filter(r => !facets.month.size || [...monthsOf(r)].some(m => facets.month.has(m)))
    .filter(r => {
      const needle = q.trim().toLowerCase()
      if (!needle) return true
      const [, fm, fd] = r.date_from.split('-').map(Number)
      const hay = [LEAVE_TYPE_LABELS[r.leave_type], reviewStatusLabel(r.status), formatShortDateRange(r.date_from, r.date_to), MONTH_NAMES[fm - 1], MONTH_ABBR[fm - 1], String(fd)]
        .join(' ').toLowerCase()
      return hay.includes(needle)
    })
    .map(r => {
      const year = r.date_to.slice(0, 4)
      return {
        request: r,
        dates: `${formatShortDateRange(r.date_from, r.date_to)} ${year}`,
        label: LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type,
        days: Number(totalLeaveDays(r)),
        cover: r.status === 'approved'
          ? coverSummary(coverForRequest(r, data.entries, { profileId, publishedMonths: data.publishedMonths, today }))
          : '—',
        rosterTo: rosterLinkForDate(data.monthIds, r.date_from, { doctor: profileId, mark: true }),
        open: requestLink(r),
      }
    }), [rows, filter, facets, q, data, profileId, today])

  const phoneItems = showAll ? items : items.slice(0, PHONE_LIMIT)

  return (
    <div className="space-y-4">
      {/* Search and Filter above the section, as on the other lists; on a
          phone they are the FAB's, and the leave type pills stay. */}
      <div className="hidden md:block">
        <Toolbar
          className=""
          searchValue={q}
          onSearchChange={setQ}
          searchPlaceholder="Search type, month or status…"
          filterGroups={filterGroups}
          mobileMode="inline"
          active={active}
          onClearAll={clearAll}
        />
      </div>
      <FloatingActionMenu
        search={{ value: q, onChange: setQ, placeholder: 'Search type, month or status' }}
        filter={{ groups: filterGroups, active, onClearAll: clearAll, sheetTitle: 'Filters' }}
      />

      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        className="sheen-divider text-left"
      >
        <span className="flex items-center gap-1.5">
          Leave record
          <ChevronDown className={`divider-meta h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} aria-hidden="true" />
        </span>
        <span className="divider-meta normal-case font-normal">{plural(rows.length, 'request')} · {plural(approvedDays, 'day')}</span>
      </button>

      {!collapsed && (<>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by leave type">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => { setFilter(f.key); setShowAll(false) }}
            className={`toolbar-pill min-h-[44px] md:min-h-0 ${filter === f.key ? 'toolbar-pill-active' : 'toolbar-pill-idle'}`}
          >
            {f.label} <span className="opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-ink-muted">No leave requests{filter === 'all' && !active ? '' : ' match'} this year.</p>
      ) : (
        <>
          {/* Desktop: a table. */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-line text-xs font-medium text-ink-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Dates</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Days</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Shift and cover</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Open in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-line">
                {items.map(item => (
                  <tr key={item.request.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">{item.dates}</td>
                    <td className="px-4 py-3 text-ink"><span className="flex items-center gap-2"><LeaveCodeBox leaveType={item.request.leave_type} />{item.label}</span></td>
                    <td className="px-4 py-3 text-right text-ink">{item.days}</td>
                    <td className="px-4 py-3"><Tag variant="status" tone={STATUS_TONE[item.request.status] || 'neutral'}>{reviewStatusLabel(item.request.status)}</Tag></td>
                    <td className="px-4 py-3 text-ink-light">{item.cover}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="flex items-center gap-3">
                        {item.rosterTo && <Link to={item.rosterTo} className={`inline-flex items-center gap-0.5 ${linkClass}`}>Roster<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>}
                        <Link to={item.open.to} className={`inline-flex items-center gap-0.5 ${linkClass}`}>{item.open.label}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: one stacked row per request. */}
          <div className="md:hidden">
            <ul className="card divide-y divide-slate-line overflow-hidden">
              {phoneItems.map(item => (
                <li key={item.request.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><LeaveCodeBox leaveType={item.request.leave_type} />{item.label}</h3>
                    <Tag variant="status" tone={STATUS_TONE[item.request.status] || 'neutral'}>{reviewStatusLabel(item.request.status)}</Tag>
                  </div>
                  <p className="mt-2 text-sm font-bold text-ink">{item.dates}</p>
                  <p className="mt-1 text-xs text-ink-muted">{plural(item.days, 'day')} · {item.cover}</p>
                  <p className="mt-1 flex items-center gap-4 text-sm">
                    {item.rosterTo && <Link to={item.rosterTo} className={`flex min-h-[44px] items-center gap-0.5 ${linkClass}`}>Roster<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>}
                    <Link to={item.open.to} className={`flex min-h-[44px] items-center gap-0.5 ${linkClass}`}>{item.open.label}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
                  </p>
                </li>
              ))}
            </ul>
            {!showAll && items.length > PHONE_LIMIT && (
              <button type="button" onClick={() => setShowAll(true)} className="btn-secondary mt-3 min-h-[44px] w-full justify-center">
                Show all {items.length}
              </button>
            )}
          </div>
        </>
      )}
      </>)}
    </div>
  )
}
