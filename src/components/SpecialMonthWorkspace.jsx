import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { weeksForMonth, monthsForYear, COLUMN_BADGE_LABEL, LEAVE_OTHER_COLUMN, LEAVE_CAPACITY_COLUMNS, capacityStateForCount } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { shortLeaveTypeLabel, SPECIAL_LEAVE_SOFT_CAP } from '../lib/leaveRequests'
import { todayStr, dayOfWeek, formatShortDateRange } from '../lib/dateRange'
import { specialCountsByDate, specialMonthMarkers } from '../lib/specialPlanner'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'
import { useAuth } from '../context/AuthContext'
import CategoryBadge from './CategoryBadge'
import DateStepper from './DateStepper'
import Modal from './Modal'
import PlannerRequestPanel, { PanelReading, PANEL_DESKTOP_WRAPPER, PANEL_DESKTOP_WIDTH } from './PlannerRequestPanel'
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
  // Opening the day panel straight onto its request form — the panel's
  // "Request special leave" action, which is the same journey as tapping a
  // day and pressing "Request leave for this day", one step shorter.
  const [openFormOnOpen, setOpenFormOnOpen] = useState(false)

  const today = todayStr()
  const weeks = weeksForMonth(year, month)
  const monthLabel = monthsForYear(year)[month - 1].label
  const countsByDate = specialCountsByDate(leaveByDate)
  const monthMarkers = specialMonthMarkers(year, month, countsByDate, publicHolidaysByDate)
  const markersByDate = new Map(monthMarkers.map(m => [m.date, m]))
  const monthGuidelineDays = monthMarkers.filter(m => m.overSoftCap).length

  // Today when today is in the month being viewed, else the 1st — so a
  // doctor browsing ahead still lands on a sensible date rather than an
  // empty field. Same rule the Annual planner's own panel uses.
  function openRequestLeave() {
    const isCurrentMonth = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7))
    setOpenFormOnOpen(true)
    setSelectedDate(isCurrentMonth ? today : `${year}-${String(month).padStart(2, '0')}-01`)
  }

  function closeDayPanel() {
    setSelectedDate(null)
    setOpenFormOnOpen(false)
  }

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
          <ChevronLeft className="h-4 w-4" /> Overview
        </button>
        <div className="flex items-center gap-2">
          <DateStepper unit="month" year={year} month={month} onChange={onMonthChange} />
          <SpecialLegendTrigger ruleIntro={ruleIntro} ruleBullets={ruleBullets} />
        </div>
      </div>

      {/* Where this month stands, and the way to ask — the Special tab had
          no request path at all short of finding a tappable day cell. The
          reading is the month's pressure days rather than Annual's
          days-with-room: special leave's only capacity number is the
          shared 3-doctor guideline, and the short list (the days already
          at it) is the one worth naming. */}
      <div className={`${PANEL_DESKTOP_WRAPPER} mt-3`}>
        <SpecialRequestPanel
          className={PANEL_DESKTOP_WIDTH}
          monthLabel={monthLabel}
          guidelineDays={monthGuidelineDays}
          totalDays={monthMarkers.length}
          onRequestLeave={openRequestLeave}
        />
      </div>
      <div className="mt-3 lg:hidden">
        <SpecialRequestPanel
          monthLabel={monthLabel}
          guidelineDays={monthGuidelineDays}
          totalDays={monthMarkers.length}
          onRequestLeave={openRequestLeave}
        />
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
                className={`min-h-[86px] border-b border-r border-slate-line p-1.5 text-left align-top transition-colors hover:bg-canvas-sunken ${
                  marker?.isPublicHoliday ? 'ring-2 ring-inset ring-ink' : ''
                }`}
              >
                {/* Today is the date number's own accent chip rather than a
                    ring around the cell: a ring in a fifth colour on top of
                    a red or orange fill is just another thing to decode,
                    and this is the same marker the Annual grid uses. */}
                {/* Same treatment as the Annual grid: the number is plain
                    and pinned top-left on every cell, and the day's pressure
                    is carried by the category badges' fill instead. */}
                <span className="flex items-center justify-between gap-1">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                    date === today ? 'bg-accent text-on-fill' : 'text-ink'
                  }`}>
                    {Number(date.slice(-2))}
                  </span>
                </span>
                {marker?.isPublicHoliday && (
                  <span className="mt-0.5 block truncate text-[10px] font-medium text-ink-muted">{marker.publicHolidayName}</span>
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
                        e.status === 'pending' ? 'italic text-ink-muted' : 'text-ink'
                      }`}
                    >
                      <CategoryBadge label={COLUMN_BADGE_LABEL[e.columnKey]} size={14} fill={marker?.capacityState.swatch} />
                      <span className="truncate">{displayNames.get(e.profileId) ?? e.surname}</span>
                    </span>
                  ))}
                  {rows.length > 3 && <span className="block text-[10px] text-ink-muted">+{rows.length - 3} more</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div data-testid="special-mobile-grid" className="mt-4 lg:hidden">
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
                className={`relative flex aspect-square flex-col items-center gap-0.5 rounded-md border pt-[19px] text-xs ${
                  marker?.isPublicHoliday ? 'border-ink ring-1 ring-inset ring-ink' : 'border-slate-line'
                } ${date === today ? 'ring-1 ring-accent' : ''} bg-canvas-raised`}
              >
                {/* Plain number; capacity is on the badges below. Pinned to
                    the corner rather than centred in the flex flow,
                    exactly as the Annual grid's phone cells do it: a centred
                    number sits at a different height on a day with badges than
                    on one without, so the row of numbers wandered as you
                    scanned across a week. */}
                <span className="absolute left-1.5 top-1 font-bold text-ink">{Number(date.slice(-2))}</span>
                {badges.length > 0 && (
                  <span className="flex items-center gap-[1px]">
                    {badges.slice(0, 3).map(key => (
                      <CategoryBadge key={key} label={COLUMN_BADGE_LABEL[key]} size={11} fill={marker?.capacityState.swatch} />
                    ))}
                    {badges.length > 3 && (
                      <span className="text-[8px] font-semibold text-ink-muted">
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
          initialShowRequestForm={openFormOnOpen}
          onClose={closeDayPanel}
          onSubmitted={onDataChanged}
        />
      )}

      <p className="mt-3 text-xs text-ink-muted">{monthLabel} {year} · tap a day for detail</p>
    </div>
  )
}

// The Special tab's own fill of the shared planner panel: no per-category
// reading to give (the guideline is one shared number for everyone), so it
// reports how much of the month is already at it.
function SpecialRequestPanel({ monthLabel, guidelineDays, totalDays, onRequestLeave, className }) {
  const atGuideline = guidelineDays > 0
  return (
    <PlannerRequestPanel
      className={className}
      eyebrow={`Special leave · ${monthLabel}`}
      actionLabel="Request special leave"
      onAction={onRequestLeave}
    >
      <PanelReading
        value={guidelineDays}
        valueClassName={atGuideline ? 'text-capNear-ink' : 'text-capAvailable-ink'}
        unit={atGuideline
          ? `of ${totalDays} days are at the ${SPECIAL_LEAVE_SOFT_CAP}-doctor guideline — the rest have room`
          : `days are at the ${SPECIAL_LEAVE_SOFT_CAP}-doctor guideline — every day this month has room`}
      />
    </PlannerRequestPanel>
  )
}

// One day's leave, in the same row shape the Annual planner's day review
// uses — category badge, name, category, leave type, full leave period,
// status — so a row reads identically on both planner tabs.
// Built on the shared Modal — a bottom sheet on mobile, a centered card on
// desktop — so tapping a day here lands exactly where tapping a day on the
// Annual planner does, rather than in this tab's own hand-rolled panel.
function DayPanel({ date, rows, count, phName, displayNames, initialShowRequestForm = false, onClose, onSubmitted }) {
  const { canSubmitLeave } = useAuth()
  const [showRequestForm, setShowRequestForm] = useState(initialShowRequestForm)
  const formatted = `${WEEKDAY_NAMES[dayOfWeek(date)]}, ${date}`
  const remaining = Math.max(0, SPECIAL_LEAVE_SOFT_CAP - count)
  const atGuideline = count >= SPECIAL_LEAVE_SOFT_CAP
  const panelState = capacityStateForCount(count)

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
            it will be refused the way the Annual banner's does. It carries
            the day's capacity colour at every count, not just at the
            guideline: the Annual planner reports each state and a day here
            showing nothing read as "no guideline applies". */}
        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ring-1 ring-inset ${panelState.tint} ${panelState.ringDark}`}>
          <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${panelState.dark}`}>
            {atGuideline ? '!' : count === 0 ? '✓' : '!'}
          </span>
          <div>
            <p className={`font-bold ${panelState.text}`}>{count} of {SPECIAL_LEAVE_SOFT_CAP} slots taken</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {atGuideline
                ? 'At the guideline for special leave. Requests still go through; an admin decides.'
                : `${remaining} ${remaining === 1 ? 'slot' : 'slots'} available across all doctor categories.`}
            </p>
          </div>
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
