import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, CircleCheck, TriangleAlert, Users, Pin, Calendar, Clock, ExternalLink, ListChecks } from 'lucide-react'
import { monthsForYear } from '../lib/leaveYearGrid'
import { annualDaysInRange, pendingRequestCountInRange } from '../lib/leaveDashboard'
import {
  pressureDatesInYear, monthDayMarkers, monthSummaryLine, firstPressureRangeInMonth,
  monthCapacityWarningsByColumn, entriesInRange,
} from '../lib/annualPlannerOverview'
import { monthBounds, todayStr, dayOfWeek } from '../lib/dateRange'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My leave' },
  { key: 'pending', label: 'Pending' },
  { key: 'capacity', label: 'Capacity issues' },
]

// Narrows a { profileId, surname, ... } day-map to entries matching the
// active filter/search — shared by the month grid and the year-total stats
// so both always agree on "what's currently in view."
function filterByDate(byDate, { filter, myProfileId, searchTerm }) {
  if (filter === 'all' && !searchTerm) return byDate
  const next = new Map()
  for (const [date, entries] of byDate) {
    const visible = entries.filter(e =>
      (filter !== 'mine' || e.profileId === myProfileId) &&
      (!searchTerm || e.surname.toLowerCase().includes(searchTerm))
    )
    if (visible.length) next.set(date, visible)
  }
  return next
}

function filterRows(rows, { filter, myProfileId, searchTerm }) {
  return rows.filter(r =>
    (filter !== 'mine' || r.profile_id === myProfileId) &&
    (!searchTerm || (r.profiles?.surname ?? '').toLowerCase().includes(searchTerm))
  )
}

// A 12-month "decision" overview for the Annual Leave planner — replaces
// the old always-visible day-row spreadsheet as the default landing view.
// That spreadsheet (LeaveYearGrid) hasn't gone away — it's now the "month
// workspace" this page's actions open, for when a per-day edit/review is
// actually needed — but browsing a whole year of it wasn't a great way to
// answer "which weekends need my attention," which is what this page is
// for. approvedByDate/pendingByDate are the reshaped { profileId, surname,
// category, status } maps AnnualLeavePlanner.jsx already builds;
// approvedRows/pendingRows are the same data pre-reshape (with the raw
// profiles join), needed for the day-count maths in leaveDashboard.js.
export default function AnnualPlannerOverview({
  year, onYearChange, approvedByDate, pendingByDate, approvedRows, pendingRows,
  countByColumnPerDate, maxByColumnKey, maxFullTime, eligibleHeadcount, myProfileId, onOpenWorkspace,
}) {
  const today = todayStr()
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(Number(today.slice(0, 4)) === year ? currentMonth : 1)
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const searchTerm = searchQuery.trim().toLowerCase()
  // Capacity pressure is a fact about pending+approved leave on record
  // (matching the real cap check in leaveRequests.js), not about whoever's
  // currently searching/filtering — always computed unfiltered.
  const pressureDates = useMemo(() => pressureDatesInYear(countByColumnPerDate, maxByColumnKey), [countByColumnPerDate, maxByColumnKey])

  // Hooks must run unconditionally (Rules of Hooks) — compute the filtered
  // maps/rows every render, then swap in an empty result for "Pending"
  // (which hides approved leave entirely) after the fact rather than
  // skipping the memo call itself. The filter context is built inside each
  // callback (not hoisted to a shared variable) so its dependencies are
  // just the primitives already listed below, not a new object every render.
  const filteredApprovedByDate = useMemo(
    () => filterByDate(approvedByDate, { filter, myProfileId, searchTerm }), [approvedByDate, filter, myProfileId, searchTerm]
  )
  const visiblePendingByDate = useMemo(
    () => filterByDate(pendingByDate, { filter, myProfileId, searchTerm }), [pendingByDate, filter, myProfileId, searchTerm]
  )
  const filteredApprovedRows = useMemo(
    () => filterRows(approvedRows, { filter, myProfileId, searchTerm }), [approvedRows, filter, myProfileId, searchTerm]
  )
  const visiblePendingRows = useMemo(
    () => filterRows(pendingRows, { filter, myProfileId, searchTerm }), [pendingRows, filter, myProfileId, searchTerm]
  )
  const visibleApprovedByDate = filter === 'pending' ? new Map() : filteredApprovedByDate
  const visibleApprovedRows = filter === 'pending' ? [] : filteredApprovedRows

  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const approvedDaysTotal = annualDaysInRange(visibleApprovedRows, yearStart, yearEnd)
  // The full-time aggregate cap (MO + Registrar + EC COSMO/Intern combined)
  // is the real department-wide ceiling on how many doctors can be off on
  // the same day — OT COSMO/Intern has its own separate, independent cap
  // and isn't added on top of it for this headline figure.
  const dailyCap = maxFullTime
  const capPercent = eligibleHeadcount ? Math.round((dailyCap / eligibleHeadcount) * 100) : null

  const months = monthsForYear(year)
  const monthCards = months.map(m => {
    const markers = monthDayMarkers(m.year, m.month, {
      approvedByDate: visibleApprovedByDate, pendingByDate: visiblePendingByDate, pressureDates,
    })
    const pressureDayCount = markers.filter(d => d.isPressure).length
    const { start, end } = monthBounds(m.year, m.month)
    const pendingCount = pendingRequestCountInRange(visiblePendingRows, start, end)
    return { ...m, markers, pressureDayCount, pendingCount, summaryLine: monthSummaryLine({ pressureDayCount, pendingCount }) }
  })

  const selectedRange = firstPressureRangeInMonth(year, selectedMonth, pressureDates)
  const selectedMonthLabel = months[selectedMonth - 1].label
  const { start: selMonthStart, end: selMonthEnd } = monthBounds(year, selectedMonth)

  return (
    <div className="mt-6">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Annual planner</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onYearChange(year - 1)} className="btn-secondary px-2 py-1 text-sm" aria-label="Previous year">←</button>
            <span className="font-display text-base font-semibold text-ink">{year}</span>
            <button type="button" onClick={() => onYearChange(year + 1)} className="btn-secondary px-2 py-1 text-sm" aria-label="Next year">→</button>
            <button type="button" onClick={() => onYearChange(Number(today.slice(0, 4)))} className="btn-secondary px-2 py-1 text-xs">Today</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search surname…"
              aria-label="Search by surname"
              className="input-field w-48 py-1.5 pl-7 text-sm"
            />
          </span>
          <div className="flex gap-1 rounded-lg border border-slate-line bg-canvas-raised p-0.5">
            {['Year', 'Month'].map(v => (
              <button
                key={v}
                type="button"
                onClick={v === 'Month' ? () => onOpenWorkspace(selectedMonth) : undefined}
                aria-current={v === 'Year' ? 'true' : undefined}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  v === 'Year' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 rounded-lg border border-slate-line bg-canvas-raised p-0.5 w-fit">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Year-total stat strip ── */}
      <div data-testid="annual-year-stats" className="mt-4 flex flex-wrap items-center gap-6 rounded-lg border border-slate-line bg-canvas-raised px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <CircleCheck className="h-4 w-4 text-success" />
          <span className="text-ink-muted">Approved leave ({year})</span>
          <span className="font-semibold text-ink">{approvedDaysTotal} days</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-accent" />
          <span className="text-ink-muted">Cap per day</span>
          <span className="font-semibold text-ink">Max {dailyCap} doctors{capPercent != null ? ` (${capPercent}%)` : ''}</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <TriangleAlert className="h-4 w-4 text-flagAmber" />
          <span className="text-ink-muted">Capacity warnings</span>
          <span className="font-semibold text-ink">{pressureDates.size} pressure {pressureDates.size === 1 ? 'day' : 'days'}</span>
        </span>
      </div>

      {/* ── Main workspace: 4x3 month grid + sticky inspector ── */}
      <div className="mt-4 flex items-start gap-4">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {monthCards.map(m => (
            <MonthCard
              key={m.month}
              month={m}
              filter={filter}
              isSelected={m.month === selectedMonth}
              onSelect={() => setSelectedMonth(m.month)}
            />
          ))}
        </div>

        <div data-testid="annual-inspector" className="sticky top-4 w-80 flex-shrink-0 rounded-lg border border-slate-line bg-canvas-raised p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Pin className="h-3.5 w-3.5" /> Selected month
          </div>
          <p className="mt-1 text-lg font-semibold text-ink">{selectedMonthLabel} {year}</p>

          <div className="mt-3 space-y-2 border-t border-slate-line pt-3">
            <InspectorStat icon={Calendar} label="Approved leave" value={`${annualDaysInRange(visibleApprovedRows, selMonthStart, selMonthEnd)} days`} />
            <InspectorStat
              icon={Clock}
              label="Pending requests"
              value={`${pendingRequestCountInRange(visiblePendingRows, selMonthStart, selMonthEnd)} requests`}
            />
            <InspectorStat icon={TriangleAlert} label="Capacity warnings" value={`${monthCards[selectedMonth - 1].pressureDayCount} days`} />
          </div>

          <div className="mt-3 space-y-1 border-t border-slate-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Capacity by category</p>
            {monthCapacityWarningsByColumn(year, selectedMonth, countByColumnPerDate, maxByColumnKey).map(col => (
              <div key={col.key} className="flex items-center justify-between text-sm">
                <span className="text-ink-light">{col.label}</span>
                <span className={col.days > 0 ? 'font-medium text-flagAmber' : 'text-ink-muted'}>{col.days > 0 ? `${col.days} at cap` : '—'}</span>
              </div>
            ))}
          </div>

          {selectedRange ? (
            <div className="mt-3 border-t border-slate-line pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Date range</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">
                {Number(selectedRange.from.slice(-2))}–{Number(selectedRange.to.slice(-2))} {selectedMonthLabel.slice(0, 3)}
              </p>
              <ul className="mt-2 space-y-1">
                {entriesInRange(selectedRange.from, selectedRange.to, { approvedByDate: visibleApprovedByDate, pendingByDate: visiblePendingByDate }).map(e => (
                  <li key={e.surname} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{e.surname}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      e.status === 'approved' ? 'bg-success-bg text-success' : 'bg-flagAmber-bg text-flagAmber'
                    }`}>
                      {e.status === 'approved' ? 'Approved' : 'Pending'}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-flagAmber-bg p-3 text-xs text-flagAmber">
                <TriangleAlert className="h-4 w-4 flex-shrink-0" />
                <span>{monthCards[selectedMonth - 1].pressureDayCount} pressure days in this range</span>
              </div>
            </div>
          ) : (
            <p className="mt-3 border-t border-slate-line pt-3 text-sm text-ink-muted">No capacity pressure this month.</p>
          )}

          <div className="mt-4 space-y-2">
            <button type="button" onClick={() => onOpenWorkspace(selectedMonth)} className="btn-primary flex w-full items-center justify-center gap-1.5 text-sm">
              <ExternalLink className="h-3.5 w-3.5" /> Open month workspace
            </button>
            <Link to="/leave?tab=planners&sub=requests" className="btn-secondary flex w-full items-center justify-center gap-1.5 text-sm">
              <ListChecks className="h-3.5 w-3.5" /> View requests
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function InspectorStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-ink-muted"><Icon className="h-3.5 w-3.5" /> {label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  )
}

// One month's compact overview: title, a quiet one-line summary, and a
// calendar-shaped grid of small day markers rather than a dense day-row
// table — approved leave is a solid teal square, a pending-only day is an
// amber outline, and a capacity-pressure day gets a rose corner dot
// layered on top regardless of its other state. Empty days stay blank.
function MonthCard({ month, filter, isSelected, onSelect }) {
  const leadingBlanks = (dayOfWeek(month.markers[0].date) + 6) % 7 // Monday-start
  const cells = [...Array(leadingBlanks).fill(null), ...month.markers]

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`card p-3 text-left transition-colors ${isSelected ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/40'}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-semibold text-ink">{month.label}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">{month.summaryLine}</p>

      <div className="mt-2 grid grid-cols-7 gap-[3px]">
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} className="h-3 w-3" />
          const dim = filter === 'capacity' && !day.isPressure
          const cellClass = dim
            ? 'bg-canvas-sunken/40'
            : day.hasApproved
              ? 'bg-accent'
              : day.hasPending
                ? 'border border-flagAmber bg-flagAmber-bg'
                : 'bg-canvas-sunken/70'
          return (
            <span key={day.date} className="relative h-3 w-3">
              <span className={`block h-3 w-3 rounded-sm ${cellClass}`} />
              {day.isPressure && !dim && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-rose-dark" />}
            </span>
          )
        })}
      </div>
    </button>
  )
}
