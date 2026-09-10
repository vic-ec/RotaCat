import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { weeksForMonth, monthsForYear, COLUMN_BADGE_LABEL, LEAVE_OTHER_COLUMN, LEAVE_CAPACITY_COLUMNS } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { shortLeaveTypeLabel, SPECIAL_LEAVE_SOFT_CAP } from '../lib/leaveRequests'
import { todayStr, dayOfWeek, formatShortDateRange } from '../lib/dateRange'
import { specialCountsByDate, specialMonthMarkers } from '../lib/specialPlanner'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'
import { useAuth } from '../context/AuthContext'
import CategoryBadge from './CategoryBadge'
import DateStepper from './DateStepper'
import Modal from './Modal'
import LeaveRequestForm from './LeaveRequestForm'
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
  rotationsByDoctorId, onBack, onDataChanged, ruleIntro, ruleBullets,
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
  const monthMarkers = specialMonthMarkers(year, month, countsByDate, publicHolidaysByDate)
  const markersByDate = new Map(monthMarkers.map(m => [m.date, m]))

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
          same day panel — mirrors MonthWorkspace's own two grids, including
          how they colour: every cell is filled by its own capacity state
          (green available → red at capacity), so the month reads as a heat
          map at a glance rather than needing a corner dot to be found and
          decoded one day at a time. */}
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
                className={`min-h-[86px] border-b border-r border-slate-line p-1.5 text-left align-top transition-colors hover:brightness-95 ${
                  marker?.capacityState.light ?? ''
                } ${marker?.isPublicHoliday ? 'ring-2 ring-inset ring-ink' : ''}`}
              >
                {/* Today is the date number's own accent chip rather than a
                    ring around the cell: a ring in a fifth colour on top of
                    a red or orange fill is just another thing to decode,
                    and this is the same marker the Annual grid uses. */}
                <span className="flex items-center justify-between gap-1">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                    date === today ? 'bg-accent text-on-fill' : marker?.capacityState.onFillText ?? 'text-ink'
                  }`}>
                    {Number(date.slice(-2))}
                  </span>
                </span>
                {marker?.isPublicHoliday && (
                  <span className={`mt-0.5 block truncate text-[10px] font-medium ${marker.capacityState.onFillMuted}`}>{marker.publicHolidayName}</span>
                )}
                {/* A badge per name, as on the phone cells and in the day
                    panel — a surname alone doesn't say which group is out,
                    which is the question a doctor scanning the month is
                    actually asking. Per name rather than one badge per
                    category group (the Annual grid's shape): this cell caps
                    at three names, so grouping would save no rows. */}
                <span className="mt-0.5 block space-y-0.5">
                  {rows.slice(0, 3).map(e => (
                    <span
                      key={`${e.profileId}-${e.leaveType}-${e.dateFrom}`}
                      className={`flex items-center gap-1 text-[11px] leading-tight ${
                        e.status === 'pending' ? `italic ${marker?.capacityState.onFillMuted}` : marker?.capacityState.onFillText
                      }`}
                    >
                      <CategoryBadge label={COLUMN_BADGE_LABEL[e.columnKey]} size={14} />
                      <span className="truncate">{displayNames.get(e.profileId) ?? e.surname}</span>
                    </span>
                  ))}
                  {rows.length > 3 && <span className={`block text-[10px] ${marker?.capacityState.onFillMuted}`}>+{rows.length - 3} more</span>}
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
            // Which categories are out, not just how many people — the same
            // EC/MO/Reg/OT badges the day panel and the Annual grid use, so
            // a doctor can see at a glance whether it's their own group
            // taking the slots. Capped at three with a +N tail; the cells
            // are one-seventh of a phone screen wide.
            const badges = [...new Set(rowsForDate(date).map(r => r.columnKey))]
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border text-xs ${
                  marker?.isPublicHoliday ? 'border-ink ring-1 ring-inset ring-ink' : 'border-slate-line'
                } ${date === today ? 'ring-1 ring-accent' : ''} ${marker?.capacityState.light ?? 'bg-canvas-raised'}`}
              >
                <span className={marker?.capacityState.onFillText ?? 'text-ink'}>{Number(date.slice(-2))}</span>
                {badges.length > 0 && (
                  <span className="flex items-center gap-[1px]">
                    {badges.slice(0, 3).map(key => (
                      <CategoryBadge key={key} label={COLUMN_BADGE_LABEL[key]} size={11} />
                    ))}
                    {badges.length > 3 && (
                      <span className={`text-[8px] font-semibold ${marker?.capacityState.onFillText ?? 'text-ink-muted'}`}>
                        +{badges.length - 3}
                      </span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selectedDate && (
        <DayPanel
          date={selectedDate}
          rows={rowsForDate(selectedDate)}
          count={countsByDate.get(selectedDate) || 0}
          phName={publicHolidaysByDate.get(selectedDate)}
          displayNames={displayNames}
          onClose={() => setSelectedDate(null)}
          onSubmitted={onDataChanged}
        />
      )}

      <p className="mt-3 text-xs text-ink-muted">{monthLabel} {year} · tap a day for detail</p>
    </div>
  )
}

// One day's leave, in the same row shape the Annual planner's day review
// uses — category badge, name, category, leave type, full leave period,
// status — so a row reads identically on both planner tabs.
// Built on the shared Modal — a bottom sheet on mobile, a centered card on
// desktop — so tapping a day here lands exactly where tapping a day on the
// Annual planner does, rather than in this tab's own hand-rolled panel.
function DayPanel({ date, rows, count, phName, displayNames, onClose, onSubmitted }) {
  const { canSubmitLeave } = useAuth()
  const [showRequestForm, setShowRequestForm] = useState(false)
  const formatted = `${WEEKDAY_NAMES[dayOfWeek(date)]}, ${date}`
  const remaining = Math.max(0, SPECIAL_LEAVE_SOFT_CAP - count)
  const atGuideline = count >= SPECIAL_LEAVE_SOFT_CAP

  if (showRequestForm) {
    return (
      <Modal title={formatted} onClose={onClose} maxWidthClassName="md:max-w-lg">
        <button
          type="button"
          onClick={() => setShowRequestForm(false)}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div className="mt-2">
          <LeaveRequestForm
            initialDateFrom={date}
            initialDateTo={date}
            // Opened from the Special tab, so the type leads with Special
            // leave rather than Annual — still a plain dropdown the
            // requester can change.
            initialLeaveType="special_leave"
            onSubmitted={() => { setShowRequestForm(false); onSubmitted?.() }}
          />
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={formatted} onClose={onClose} maxWidthClassName="md:max-w-lg">
      <div>
        {/* Slots, worded as the guideline it actually is — special leave has
            no enforced cap, so "N of 3 taken" must not imply a request over
            it will be refused the way the Annual banner's does. */}
        <div className={`rounded-lg px-3 py-2 text-sm ${atGuideline ? 'bg-flagAmber-bg text-flagAmber' : 'bg-canvas-sunken text-ink-light'}`}>
          <span className="font-semibold">{count} of {SPECIAL_LEAVE_SOFT_CAP} slots taken</span>
          {atGuideline
            ? ' — at the guideline for special leave (any category). Requests still go through; an admin decides.'
            : ` — ${remaining} ${remaining === 1 ? 'slot' : 'slots'} available (guideline, any category).`}
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

        {canSubmitLeave && (
          <button
            type="button"
            onClick={() => setShowRequestForm(true)}
            className="btn-primary mt-4 w-full text-sm"
          >
            Request leave for this day
          </button>
        )}
      </div>
    </Modal>
  )
}
