import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Calendar, NotebookTabs, FileText } from 'lucide-react'
import Tag from '../Tag'
import LeaveCodeBox from './LeaveCodeBox'
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
import { coverForRequest, coverSummary, coverNote, shiftsAffected, isCountedLeave } from '../../lib/myYear'
import { rosterLinkForDate } from '../../lib/myYearData'
import { leaveDestination, requestLink, teamLeaveLink } from '../../lib/myYearLinks'
import { plural } from '../../lib/text'

const PHONE_LIMIT = 5
const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' }

// The three ways out of a desktop row: the roster on its first day, the
// planner showing it, and the request itself — an admin's Team Leave › All
// Leave with its details open; a doctor's own My Requests, scrolled to it.
// The planner is left out for leave no planner shows (rejected, cancelled,
// still pending).
function rowActions(r, { isAdmin, rosterTo }) {
  const planner = r.status === 'approved' ? requestLink(r) : null
  return {
    roster: rosterTo,
    planner: planner ? { to: planner.to, label: `View in ${planner.label}` } : null,
    request: { to: isAdmin ? teamLeaveLink(r) : `/leave?tab=requests&request=${r.id}`, label: isAdmin ? 'View request in All Leave' : 'View request in My Requests' },
  }
}

function ActionLink({ to, icon, label }) {
  if (!to) return <span className="h-9 w-9" aria-hidden="true" />
  return (
    <Link to={to} title={label} aria-label={label} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink">
      {icon}
    </Link>
  )
}
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
// `?request=<id>` (a link to one request, e.g. a sick day from the
// Overview): the list shows in full, scrolls to that request and rings it.
// `leading` (the page's one action, e.g. Capture leave) and `controls` (the
// year stepper and Go to) share this tab's one controls row: on a desktop
// action, search, Filter, then the year controls at the right; on a phone
// action and year controls (search and Filter are the FAB's). The four
// quick type buttons are gone: Filter narrows by leave type.
export default function MyYearLeave({ rows, data, profileId, today, isAdmin = false, own = false, leading = null, controls = null }) {
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('request')
  const wide = useIsDesktop(1024)
  const isMd = useIsDesktop(768)
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

  const approvedDays = useMemo(() => rows.filter(isCountedLeave).reduce((s, r) => s + Number(totalLeaveDays(r)), 0), [rows])
  const items = useMemo(() => rows
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
        ...(() => {
          const c = r.status === 'approved' ? coverForRequest(r, data.entries, { profileId, publishedMonths: data.publishedMonths, today }) : null
          return { cover: c ? coverSummary(c) : '—', shifts: c ? shiftsAffected(c) : '—', note: c ? coverNote(c) : '—' }
        })(),
        rosterTo: rosterLinkForDate(data.monthIds, r.date_from, { doctor: profileId, mark: true }),
        // The request where it is shown (see leaveDestination); none for
        // rejected or cancelled leave, or a sick day already on this list.
        open: leaveDestination(r, { isAdmin, own, wide, profileId, inLeaveTab: true }),
      }
    }), [rows, facets, q, data, profileId, today, isAdmin, own, wide])

  // A phone shows the first few, with Show all; the desktop table, all.
  const phoneItems = showAll ? items : items.slice(0, PHONE_LIMIT)

  // The Staff list's spacing: 8px between the section bar and what it heads.
  return (
    <div className="space-y-2">
      <div className="hidden items-center gap-2 md:flex">
        {leading}
        <Toolbar
          className="min-w-0 flex-1"
          compact
          searchValue={q}
          onSearchChange={setQ}
          searchPlaceholder="Search type, month or status…"
          filterGroups={filterGroups}
          mobileMode="inline"
          active={active}
          onClearAll={clearAll}
          trailing={controls && <div className="flex flex-shrink-0 items-center gap-2">{controls}</div>}
        />
      </div>
      <div className="flex flex-nowrap items-center gap-2 md:hidden">
        {leading}
        {controls}
      </div>
      <FloatingActionMenu
        search={{ value: q, onChange: setQ, placeholder: 'Search type, month or status' }}
        filter={{ groups: filterGroups, active, onClearAll: clearAll, sheetTitle: 'Filters' }}
      />
      {/* What the old "Leave record" bar said: the tab is the section. */}
      <p className="text-xs text-ink-muted" data-testid="leave-record-summary">{plural(rows.length, 'request')} · {plural(approvedDays, 'day')} approved</p>

      {items.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-ink-muted">No leave requests{!active ? '' : ' match'} this year.</p>
      ) : (
        <>
          {/* Desktop: a table, the Overview's width. One or the other is
              rendered, never both, so a request is in the page once. */}
          {isMd ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="leave-table">
              <thead>
                <tr className="border-b border-slate-line text-xs text-ink-muted">
                  {['Leave type', 'Status', 'Period', 'Shifts affected', 'Notes', 'Actions'].map(h => (
                    <th key={h} scope="col" className={`px-4 py-2.5 font-medium ${h === 'Actions' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-line">
                {items.map(item => {
                  const r = item.request
                  const a = rowActions(r, { isAdmin, rosterTo: item.rosterTo })
                  return (
                    <tr key={r.id} data-request-id={r.id} className={focusId === r.id ? 'bg-accent-tint' : ''}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 font-semibold text-ink">
                          <LeaveCodeBox leaveType={r.leave_type} />{item.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><Tag variant="status" tone={STATUS_TONE[r.status] || 'neutral'}>{reviewStatusLabel(r.status)}</Tag></td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="block font-medium text-ink">{item.dates}</span>
                        <span className="block text-xs text-ink-muted">{plural(item.days, 'day')}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink">{item.shifts}</td>
                      <td className={`px-4 py-2.5 ${/not covered/i.test(item.note) ? 'font-medium text-ink' : 'text-ink-light'}`}>{item.note}</td>
                      <td className="px-2 py-1">
                        <span className="flex items-center justify-end gap-0.5">
                          <ActionLink to={a.roster} icon={<Calendar className="h-4 w-4" />} label="View roster" />
                          <ActionLink to={a.planner?.to} icon={<NotebookTabs className="h-4 w-4" />} label={a.planner?.label} />
                          <ActionLink to={a.request.to} icon={<FileText className="h-4 w-4" />} label={a.request.label} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          ) : (
          // Phone: one two-line row per request.
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
            {!showAll && items.length > PHONE_LIMIT && (
              <button type="button" onClick={() => setShowAll(true)} className="btn-secondary mt-3 min-h-[44px] w-full justify-center">
                Show all {items.length}
              </button>
            )}
          </div>
          )}
        </>
      )}
    </div>
  )
}
