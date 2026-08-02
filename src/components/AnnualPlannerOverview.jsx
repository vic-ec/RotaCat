import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TriangleAlert, Pin, Calendar, Clock, ExternalLink, ListChecks, Flag } from 'lucide-react'
import { monthsForYear, LEAVE_CAPACITY_STATES, labelForLeaveCategory } from '../lib/leaveYearGrid'
import { annualDaysInRange, pendingRequestCountInRange } from '../lib/leaveDashboard'
import {
  pressureDatesInYear, monthDayMarkers, monthSummaryLine, firstPressureRangeInMonth,
  monthTotalCapacityBreakdown, monthPublicHolidayCount, entriesInRange,
} from '../lib/annualPlannerOverview'
import { monthBounds, todayStr, dayOfWeek, formatShortDateRange } from '../lib/dateRange'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My leave' },
  { key: 'pending', label: 'Pending' },
  { key: 'capacity', label: 'Capacity issues' },
]

// Narrows a { profileId, surname, ... } day-map to entries matching the
// active filter chip — shared by the month grid and the year-total stats so
// both always agree on "what's currently in view."
function filterByDate(byDate, { filter, myProfileId }) {
  if (filter === 'all') return byDate
  const next = new Map()
  for (const [date, entries] of byDate) {
    const visible = entries.filter(e => filter !== 'mine' || e.profileId === myProfileId)
    if (visible.length) next.set(date, visible)
  }
  return next
}

function filterRows(rows, { filter, myProfileId }) {
  return rows.filter(r => filter !== 'mine' || r.profile_id === myProfileId)
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
  countByColumnPerDate, publicHolidaysByDate, maxByColumnKey, myProfileId, onOpenWorkspace,
}) {
  const today = todayStr()
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(Number(today.slice(0, 4)) === year ? currentMonth : 1)
  const [filter, setFilter] = useState('all')
  const [expandedProfileId, setExpandedProfileId] = useState(null)

  // Capacity pressure is a fact about pending+approved leave on record
  // (matching the real cap check in leaveRequests.js), not about whoever's
  // currently filtering — always computed unfiltered.
  const pressureDates = useMemo(() => pressureDatesInYear(countByColumnPerDate, maxByColumnKey), [countByColumnPerDate, maxByColumnKey])

  // Hooks must run unconditionally (Rules of Hooks) — compute the filtered
  // maps/rows every render, then swap in an empty result for "Pending"
  // (which hides approved leave entirely) after the fact rather than
  // skipping the memo call itself. The filter context is built inside each
  // callback (not hoisted to a shared variable) so its dependencies are
  // just the primitives already listed below, not a new object every render.
  const filteredApprovedByDate = useMemo(
    () => filterByDate(approvedByDate, { filter, myProfileId }), [approvedByDate, filter, myProfileId]
  )
  const visiblePendingByDate = useMemo(
    () => filterByDate(pendingByDate, { filter, myProfileId }), [pendingByDate, filter, myProfileId]
  )
  const filteredApprovedRows = useMemo(
    () => filterRows(approvedRows, { filter, myProfileId }), [approvedRows, filter, myProfileId]
  )
  const visiblePendingRows = useMemo(
    () => filterRows(pendingRows, { filter, myProfileId }), [pendingRows, filter, myProfileId]
  )
  const visibleApprovedByDate = filter === 'pending' ? new Map() : filteredApprovedByDate
  const visibleApprovedRows = filter === 'pending' ? [] : filteredApprovedRows

  const months = monthsForYear(year)
  const monthCards = months.map(m => {
    const markers = monthDayMarkers(m.year, m.month, {
      approvedByDate: visibleApprovedByDate, pendingByDate: visiblePendingByDate, pressureDates, publicHolidaysByDate, countByColumnPerDate,
    })
    const pressureDayCount = markers.filter(d => d.isPressure).length
    const { start, end } = monthBounds(m.year, m.month)
    const pendingCount = pendingRequestCountInRange(visiblePendingRows, start, end)
    return { ...m, markers, pressureDayCount, pendingCount, summaryLine: monthSummaryLine({ pressureDayCount, pendingCount }) }
  })

  const selectedRange = firstPressureRangeInMonth(year, selectedMonth, pressureDates)
  const selectedMonthLabel = months[selectedMonth - 1].label
  const { start: selMonthStart, end: selMonthEnd } = monthBounds(year, selectedMonth)

  const rangeEntries = selectedRange
    ? entriesInRange(selectedRange.from, selectedRange.to, { approvedByDate: visibleApprovedByDate, pendingByDate: visiblePendingByDate })
    : []
  const rangeSummary = {
    people: rangeEntries.length,
    approved: rangeEntries.filter(e => e.status === 'approved').length,
    pending: rangeEntries.filter(e => e.status === 'pending').length,
  }

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

      {/* Day-block fill legend — matches the capacity-state colouring each
          month card's day blocks use below (item 3 of the mobile revision:
          background fill by occupied slots, not by approved/pending). */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {LEAVE_CAPACITY_STATES.map(state => (
          <span key={state.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${state.fill}`} /> {state.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink/10 ring-1 ring-inset ring-ink-muted" /> Public holiday</span>
      </div>

      {/* ── Main workspace: 4x3 month grid + sticky inspector ── */}
      {/* Mobile (<lg): stacked, full width, inspector shown first so the
          currently-selected month's detail is visible without scrolling
          past the whole grid. Desktop (lg+): unchanged side-by-side layout
          with the sticky w-80 inspector. */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 xl:grid-cols-4">
          {monthCards.map(m => (
            <MonthCard
              key={m.month}
              month={m}
              filter={filter}
              isSelected={m.month === selectedMonth}
              // Clicking an unselected month just selects it (updating the
              // inspector); clicking the already-selected one goes straight
              // to its month workspace — a second click on the same month
              // reads as "open this," not "select this again."
              onSelect={() => m.month === selectedMonth ? onOpenWorkspace(m.month) : setSelectedMonth(m.month)}
            />
          ))}
        </div>

        <div
          data-testid="annual-inspector"
          className="order-first w-full flex-shrink-0 rounded-lg border border-slate-line bg-canvas-raised p-4 lg:order-none lg:sticky lg:top-4 lg:w-80"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Pin className="h-3.5 w-3.5" /> Selected month
          </div>
          <p className="mt-1 text-lg font-semibold text-ink">{selectedMonthLabel} {year}</p>

          <div className="mt-3 space-y-2 border-t border-slate-line pt-3">
            <InspectorStat icon={Flag} label="Public holidays" value={`${monthPublicHolidayCount(year, selectedMonth, publicHolidaysByDate)} days`} />
            <InspectorStat icon={Calendar} label="Approved leave" value={`${annualDaysInRange(visibleApprovedRows, selMonthStart, selMonthEnd)} days`} />
            <InspectorStat
              icon={Clock}
              label="Pending requests"
              value={`${pendingRequestCountInRange(visiblePendingRows, selMonthStart, selMonthEnd)} requests`}
            />
            <InspectorStat icon={TriangleAlert} label="Capacity warnings" value={`${monthCards[selectedMonth - 1].pressureDayCount} days`} />
          </div>

          <div className="mt-3 space-y-2 border-t border-slate-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Leave Slot Utilization</p>
            {monthTotalCapacityBreakdown(year, selectedMonth, countByColumnPerDate).map(({ level, days }) => {
              const state = LEAVE_CAPACITY_STATES[level]
              return (
                <div key={level} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-ink-muted">
                    <span className={`h-2 w-2 rounded-full ${state.fill}`} /> {level} of 3 slots taken
                  </span>
                  <span className={days > 0 ? `font-medium ${state.text}` : 'text-ink-muted'}>
                    {days} {days === 1 ? 'day' : 'days'}
                  </span>
                </div>
              )
            })}
          </div>

          {selectedRange ? (
            <div className="mt-3 border-t border-slate-line pt-3">
              <p className="text-sm font-semibold text-ink">
                Leave during {Number(selectedRange.from.slice(-2))}–{Number(selectedRange.to.slice(-2))} {selectedMonthLabel.slice(0, 3)}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {rangeSummary.people} {rangeSummary.people === 1 ? 'person' : 'people'} · {rangeSummary.approved} approved · {rangeSummary.pending} pending
              </p>
              <ul className="mt-2 space-y-0.5">
                {rangeEntries.map(e => (
                  <li key={e.profileId}>
                    <button
                      type="button"
                      onClick={() => setExpandedProfileId(id => id === e.profileId ? null : e.profileId)}
                      className="flex w-full items-center justify-between gap-1.5 rounded px-1 py-1 text-left text-sm hover:bg-canvas-sunken"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          e.status === 'approved' ? 'bg-success-bg text-success' : 'bg-flagAmber-bg text-flagAmber'
                        }`}>
                          {e.surname}
                        </span>
                        <span className="text-xs text-ink-muted">{labelForLeaveCategory(e.category)}</span>
                      </span>
                      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        e.status === 'approved' ? 'bg-success-bg text-success' : 'bg-flagAmber-bg text-flagAmber'
                      }`}>
                        {e.status === 'approved' ? 'Approved' : 'Pending'}
                      </span>
                    </button>
                    {expandedProfileId === e.profileId && (
                      <p className="pl-2 pb-1 text-xs text-ink-muted">Full leave: {formatShortDateRange(e.dateFrom, e.dateTo)}</p>
                    )}
                  </li>
                ))}
              </ul>
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
// table — each day block is filled solid by its capacity state (green =
// available, yellow = limited, orange = near capacity, red = at capacity),
// so the grid reads as a heatmap of "can I take leave here" at a glance
// rather than requiring a tap to find out.
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
          const cellClass = dim ? 'bg-canvas-sunken/40' : day.capacityState.fill
          // A public holiday keeps its normal capacity-state fill (so the
          // colour stays readable) plus a border in a darker shade of that
          // same colour, rather than swapping the fill for a flat dark
          // block that hid which capacity state the day was actually in.
          const phRing = day.isPublicHoliday && !dim ? `ring-1 ring-inset ${day.capacityState.ringDark}` : ''
          return (
            <span key={day.date} className="h-3 w-3" title={day.publicHolidayName || `${day.capacityState.label} (${day.totalSlots} of 3)`}>
              <span className={`block h-3 w-3 rounded-sm ${cellClass} ${phRing}`} />
            </span>
          )
        })}
      </div>
    </button>
  )
}
