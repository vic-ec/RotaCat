import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import LeaveRequestRow from '../LeaveRequestRow'
import { useIsDesktop } from '../../lib/useIsDesktop'
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
import { leaveDestination } from '../../lib/myYearLinks'

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

// `?request=<id>` (a link to one request, e.g. a sick day from the
// Overview): the list shows in full, scrolls to that request and rings it.
export default function MyYearLeave({ rows, data, profileId, today, isAdmin = false, own = false }) {
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('request')
  const wide = useIsDesktop(1024)
  const isMd = useIsDesktop(768)
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(Boolean(focusId))
  const [q, setQ] = useState('')
  const [facets, setFacets] = useState(EMPTY)
  useEffect(() => {
    if (!focusId) return
    const el = [...document.querySelectorAll(`[data-request-id="${focusId}"]`)].find(n => n.offsetParent !== null) || document.querySelector(`[data-request-id="${focusId}"]`)
    el?.scrollIntoView?.({ block: 'center' })
  }, [focusId, rows])
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
        // The request where it is shown (see leaveDestination); none for
        // rejected or cancelled leave, or a sick day already on this list.
        open: leaveDestination(r, { isAdmin, own, wide, profileId, inLeaveTab: true }),
      }
    }), [rows, filter, facets, q, data, profileId, today, isAdmin, own, wide])

  // A phone shows the first few, with Show all; a wider screen, all.
  const phoneItems = showAll || isMd ? items : items.slice(0, PHONE_LIMIT)

  // The Staff list's spacing: 8px between the section bar and what it heads.
  return (
    <div className="space-y-2">
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



      {/* Four equal widths across the panel on a phone; the app's 30px
          pill (no taller touch padding) everywhere. */}
      <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap" role="group" aria-label="Filter by leave type">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => { setFilter(f.key); setShowAll(false) }}
            className={`toolbar-pill px-2 md:px-3 ${filter === f.key ? 'toolbar-pill-active' : 'toolbar-pill-idle'}`}
          >
            {f.label} <span className="opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>
      {/* What the old "Leave record" bar said: the tab is the section. */}
      <p className="text-xs text-ink-muted" data-testid="leave-record-summary">{plural(rows.length, 'request')} · {plural(approvedDays, 'day')} approved</p>

      {items.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-ink-muted">No leave requests{filter === 'all' && !active ? '' : ' match'} this year.</p>
      ) : (
        <>
          {/* One two-line row per request at every width: the column is the
              Roster and Planners lists' width (the page sets it). */}
          <div>
            <ul className="card divide-y divide-slate-line overflow-hidden">
              {phoneItems.map(item => (
                <LeaveRequestRow
                  key={item.request.id}
                  request={item.request}
                  dates={item.dates}
                  days={item.days}
                  detail={item.cover && item.cover !== '—' ? item.cover : ''}
                  rosterTo={item.rosterTo}
                  open={item.open}
                  focused={focusId === item.request.id}
                />
              ))}
            </ul>
            {!showAll && !isMd && items.length > PHONE_LIMIT && (
              <button type="button" onClick={() => setShowAll(true)} className="btn-secondary mt-3 min-h-[44px] w-full justify-center">
                Show all {items.length}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
