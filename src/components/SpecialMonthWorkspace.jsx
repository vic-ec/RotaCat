import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { weeksForMonth, monthsForYear, COLUMN_BADGE_LABEL, LEAVE_OTHER_COLUMN, LEAVE_CAPACITY_COLUMNS } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { shortLeaveTypeLabel } from '../lib/leaveRequests'
import { todayStr, dayOfWeek, formatShortDateRange } from '../lib/dateRange'
import { specialCountsByDate, specialMonthMarkers } from '../lib/specialPlanner'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'
import { useAuth } from '../context/AuthContext'
import CategoryBadge from './CategoryBadge'
import DateStepper from './DateStepper'
import { SpecialLegendTrigger } from './SpecialPlannerOverview'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const GRID_COLUMNS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

// The Special planner's single-month view — the counterpart of the Annual
// planner's MonthWorkspace, opened from the overview's Open month action
// or a second click on an already-selected month card. A real calendar
// grid rather than the day-row spreadsheet this tab used to show, so
// reading surnames happens straight off the grid and clicking a day opens
// the same review panel on every viewport.
//
// Read-only by design, and that is the deliberate difference from Annual's
// workspace: approving and rejecting special leave lives in Planners →
// Requests, and there are no capacity caps to enforce here (see
// SPECIAL_LEAVE_SOFT_CAP — a documented guideline, not an enforced rule).
export default function SpecialMonthWorkspace({
  year, month, onMonthChange, leaveByDate, displayNames = new Map(), publicHolidaysByDate = new Map(),
  rotationsByDoctorId, onBack, ruleIntro, ruleBullets,
}) {
  const { isAdmin } = useAuth()
  // Consultant leave is admin-only (EC_LEAVE_PLANNER_RULES.md's Consultant
  // privacy rule) — filtered here as well as in the day panel, so a
  // non-admin never sees it in a grid cell either.
  const visibleKeys = new Set(
    (isAdmin ? GRID_COLUMNS : GRID_COLUMNS.filter(c => c.key !== LEAVE_OTHER_COLUMN.key)).map(c => c.key)
  )
  const [selectedDate, setSelectedDate] = useState(null)

  const today = todayStr()
  const weeks = weeksForMonth(year, month)
  const monthLabel = monthsForYear(year)[month - 1].label
  const countsByDate = specialCountsByDate(leaveByDate)
  const markersByDate = new Map(
    specialMonthMarkers(year, month, countsByDate, publicHolidaysByDate).map(m => [m.date, m])
  )

  function rowsForDate(date) {
    return (leaveByDate.get(date) || [])
      .map(entry => {
        const key = resolveLeaveCapacityColumn({
          category: entry.category, profileId: entry.profileId, date: entry.dateFrom, rotationsByDoctorId,
        }) ?? LEAVE_OTHER_COLUMN.key
        const column = GRID_COLUMNS.find(c => c.key === key) ?? LEAVE_OTHER_COLUMN
        return { ...entry, columnKey: key, columnLabel: column.label }
      })
      .filter(row => visibleKeys.has(row.columnKey))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-sm font-medium text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <DateStepper unit="month" year={year} month={month} onChange={onMonthChange} />
          <SpecialLegendTrigger ruleIntro={ruleIntro} ruleBullets={ruleBullets} />
        </div>
      </div>

      {/* Desktop: full weekday names and named cells with surnames read
          straight off the grid. Mobile: a compact dot grid, tapped for the
          same day panel — mirrors MonthWorkspace's own two grids. */}
      <div className="mt-4 hidden overflow-hidden rounded-lg border border-slate-line lg:block">
        <div className="grid grid-cols-7 border-b border-slate-line bg-canvas-sunken">
          {WEEKDAY_NAMES.map(d => (
            <div key={d} className="px-2 py-1.5 text-center text-xs font-semibold text-ink-muted">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((date, i) => {
            if (!date) return <div key={`blank-${i}`} className="min-h-[86px] border-b border-r border-slate-line bg-canvas-sunken/40" />
            const marker = markersByDate.get(date)
            const rows = rowsForDate(date)
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`min-h-[86px] border-b border-r border-slate-line p-1.5 text-left align-top transition-colors hover:bg-canvas-sunken ${
                  date === today ? 'ring-1 ring-inset ring-accent' : ''
                }`}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-ink">{Number(date.slice(-2))}</span>
                  {marker?.count > 0 && (
                    <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-sm ${marker.capacityState.fill}`} />
                  )}
                </span>
                {marker?.isPublicHoliday && (
                  <span className="mt-0.5 block truncate text-[10px] font-medium text-accent">{marker.publicHolidayName}</span>
                )}
                <span className="mt-0.5 block space-y-0.5">
                  {rows.slice(0, 3).map(e => (
                    <span key={`${e.profileId}-${e.leaveType}-${e.dateFrom}`} className={`block truncate text-[11px] ${e.status === 'pending' ? 'italic text-ink-muted' : 'text-ink-light'}`}>
                      {displayNames.get(e.profileId) ?? e.surname}
                    </span>
                  ))}
                  {rows.length > 3 && <span className="block text-[10px] text-ink-muted">+{rows.length - 3} more</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 lg:hidden">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-muted">
          {WEEKDAY_SHORT.map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {weeks.flat().map((date, i) => {
            if (!date) return <span key={`blank-${i}`} />
            const marker = markersByDate.get(date)
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`flex aspect-square flex-col items-center justify-center rounded-md border text-xs ${
                  date === today ? 'border-accent' : 'border-slate-line'
                } ${marker?.count > 0 ? marker.capacityState.fill : 'bg-canvas-raised'}`}
              >
                <span className={marker?.count > 0 ? marker.capacityState.onFillText : 'text-ink'}>{Number(date.slice(-2))}</span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedDate && (
        <DayPanel
          date={selectedDate}
          rows={rowsForDate(selectedDate)}
          phName={publicHolidaysByDate.get(selectedDate)}
          displayNames={displayNames}
          onClose={() => setSelectedDate(null)}
        />
      )}

      <p className="mt-3 text-xs text-ink-muted">{monthLabel} {year} · tap a day for detail</p>
    </div>
  )
}

// One day's leave, in the same row shape the Annual planner's day review
// uses — category badge, name, category, leave type, full leave period,
// status — so a row reads identically on both planner tabs.
function DayPanel({ date, rows, phName, displayNames, onClose }) {
  const formatted = `${WEEKDAY_NAMES[dayOfWeek(date)]}, ${date}`
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">{formatted}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>
        {phName && <p className="mt-1 text-sm font-medium text-accent">{phName}</p>}

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">No one is on leave today</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-line border-t border-slate-line">
            {rows.map(e => (
              <li key={`${e.profileId}-${e.leaveType}-${e.dateFrom}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryBadge label={COLUMN_BADGE_LABEL[e.columnKey]} size={18} />
                  <span className="flex-shrink-0 text-sm font-medium text-ink">{displayNames.get(e.profileId) ?? e.surname}</span>
                  <span className="truncate text-xs text-ink-muted">
                    {[
                      e.columnLabel,
                      e.leaveType ? shortLeaveTypeLabel(e.leaveType) : null,
                      e.dateFrom && e.dateTo ? formatShortDateRange(e.dateFrom, e.dateTo) : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={`flex-shrink-0 text-xs font-medium ${e.status === 'pending' ? 'text-flagAmber' : 'text-success'}`}>
                  {e.status === 'pending' ? REVIEW_STATUS_LABELS.pending : 'Approved'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
