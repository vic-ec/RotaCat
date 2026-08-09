import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TriangleAlert, Pin, Calendar, Clock, ExternalLink, ListChecks, Flag, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { monthsForYear, LEAVE_CAPACITY_STATES, LEAVE_CAPACITY_COLUMNS, labelForLeaveCategory } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { annualDaysInRange, pendingRequestCountInRange } from '../lib/leaveDashboard'
import {
  pressureDatesInYear, monthDayMarkers, monthSummaryLine, firstPressureRangeInMonth,
  monthTotalCapacityBreakdown, monthPublicHolidayCount, entriesInRange, monthCapacityMarkers,
} from '../lib/annualPlannerOverview'
import { monthBounds, todayStr, dayOfWeek, formatShortDateRange } from '../lib/dateRange'
import SelectMenu from './SelectMenu'
import LegendSheet from './LegendSheet'
import DateStepper from './DateStepper'

// Every capacity column plus a blended "All categories" option — the mobile
// non-admin overview's category picker, defaulting to the viewer's own
// column (see defaultCategoryKey below) so the very first thing they see is
// "does MY category have room," not a departmental blend they'd have to
// mentally filter themselves.
const CATEGORY_FILTER_OPTIONS = [...LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label })), { value: 'all', label: 'All categories' }]

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
  countByColumnPerDate, publicHolidaysByDate, rotationsByDoctorId, displayNames = new Map(), maxByColumnKey, myProfileId, myCategory, myContractType, onOpenWorkspace,
  ruleHintIntro, ruleHintBullets,
}) {
  const { isAdmin } = useAuth()
  const today = todayStr()
  const currentMonth = Number(today.slice(5, 7))
  const todayYear = Number(today.slice(0, 4))
  const [selectedMonth, setSelectedMonth] = useState(todayYear === year ? currentMonth : 1)
  const [expandedProfileId, setExpandedProfileId] = useState(null)

  // Non-admin mobile view only (see the render below) — which category's
  // capacity the month list/tiles reflect. Defaults to the viewer's own
  // column; falls back to the blended "all" reading for a category with no
  // capacity column (Consultant, or no signed-in profile) since there's
  // nothing personal to default to. For an Intern, resolved off TODAY's
  // date (not the month being browsed) — requirement: the planner defaults
  // to showing their CURRENT rotation on login, regardless of which month
  // they then navigate to.
  const myColumnKey = resolveLeaveCapacityColumn({ category: myCategory, contractType: myContractType, profileId: myProfileId, date: today, rotationsByDoctorId })
  const defaultCategoryKey = LEAVE_CAPACITY_COLUMNS.some(c => c.key === myColumnKey) ? myColumnKey : 'all'
  const [categoryKey, setCategoryKey] = useState(defaultCategoryKey)

  // Capacity pressure is a fact about pending+approved leave on record
  // (matching the real cap check in leaveRequests.js), not about whoever's
  // currently filtering — always computed unfiltered.
  const pressureDates = useMemo(() => pressureDatesInYear(countByColumnPerDate, maxByColumnKey), [countByColumnPerDate, maxByColumnKey])

  const months = monthsForYear(year)
  const monthCards = months.map(m => {
    const markers = monthDayMarkers(m.year, m.month, {
      approvedByDate, pendingByDate, pressureDates, publicHolidaysByDate, countByColumnPerDate,
    })
    const pressureDayCount = markers.filter(d => d.isPressure).length
    const { start, end } = monthBounds(m.year, m.month)
    const pendingCount = pendingRequestCountInRange(pendingRows, start, end)
    return { ...m, markers, pressureDayCount, pendingCount, summaryLine: monthSummaryLine({ pressureDayCount, pendingCount }) }
  })

  // Category-scoped month list for the non-admin mobile view (see the
  // render below) — each month's capacity read for just categoryKey (or the
  // blended total for 'all'), grouped by time (Current/Coming/Previous month
  // relative to today) rather than the uniform 12-tile catalogue admins/
  // desktop still get. worstState drives the tile's label chip: the most
  // severe state reached that month, so a single day at capacity still
  // surfaces even if most of the month is clear.
  const categoryMonthCards = months.map(m => {
    const markers = monthCapacityMarkers(m.year, m.month, categoryKey, { countByColumnPerDate, maxByColumnKey, publicHolidaysByDate })
    const worstState = markers.reduce(
      (worst, d) => LEAVE_CAPACITY_STATES.indexOf(d.capacityState) > LEAVE_CAPACITY_STATES.indexOf(worst) ? d.capacityState : worst,
      LEAVE_CAPACITY_STATES[0]
    )
    return { ...m, markers, worstState }
  })
  // Only the browsed year's own relationship to today matters here — a past
  // year has no "current"/"coming" month at all (every month in it already
  // happened), a future year has no "current"/"previous" (none of it has
  // happened yet), and only the current year actually splits three ways.
  const currentMonthCard = todayYear === year ? categoryMonthCards.find(m => m.month === currentMonth) : null
  const comingMonthCards = todayYear === year
    ? categoryMonthCards.filter(m => m.month > currentMonth)
    : year > todayYear ? categoryMonthCards : []
  const previousMonthCards = todayYear === year
    ? categoryMonthCards.filter(m => m.month < currentMonth)
    : year < todayYear ? categoryMonthCards : []

  const selectedRange = firstPressureRangeInMonth(year, selectedMonth, pressureDates)
  const selectedMonthLabel = months[selectedMonth - 1].label
  const { start: selMonthStart, end: selMonthEnd } = monthBounds(year, selectedMonth)

  const rangeEntries = selectedRange
    ? entriesInRange(selectedRange.from, selectedRange.to, { approvedByDate, pendingByDate })
    : []
  const rangeSummary = {
    people: rangeEntries.length,
    approved: rangeEntries.filter(e => e.status === 'approved').length,
    pending: rangeEntries.filter(e => e.status === 'pending').length,
  }

  return (
    <div>
      {/* ── Non-admin mobile: a category-first month finder, replacing the
          admin dashboard below with "which month has room for MY category"
          — see CategoryMonthTile. Admins keep the departmental dashboard on
          every viewport (their job is cross-category exception management,
          not personal capacity planning — a category filter would hide the
          very conflicts they need to see), and this same dashboard remains
          on desktop for everyone, where there's room for it. */}
      {!isAdmin && (
        <div className="lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">Annual planner</h2>
            <DateStepper unit="year" year={year} onChange={onYearChange} showToday={false}>
              <AnnualLegendTrigger ruleHintIntro={ruleHintIntro} ruleHintBullets={ruleHintBullets} />
            </DateStepper>
          </div>

          <div className="mt-3">
            <label className="label-text">Showing capacity for</label>
            <SelectMenu value={categoryKey} onChange={setCategoryKey} options={CATEGORY_FILTER_OPTIONS} />
          </div>

          {/* Current month leads — the one question a doctor lands on this
              page to answer is "can I take leave soon," so it renders first,
              never below a scroll. Coming/Previous below it are just the
              same tiles split by time instead of by best/worst, so nothing
              needs a tap to reveal it. */}
          {currentMonthCard && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Current month</p>
              <div className="mt-2 space-y-2">
                <CategoryMonthTile month={currentMonthCard} onOpen={() => onOpenWorkspace(currentMonthCard.month)} />
              </div>
            </div>
          )}

          {comingMonthCards.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Coming months</p>
              <div className="mt-2 space-y-2">
                {comingMonthCards.map(m => (
                  <CategoryMonthTile key={m.month} month={m} onOpen={() => onOpenWorkspace(m.month)} />
                ))}
              </div>
            </div>
          )}

          {previousMonthCards.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Previous months</p>
              <div className="mt-2 space-y-2">
                {previousMonthCards.map(m => (
                  <CategoryMonthTile key={m.month} month={m} onOpen={() => onOpenWorkspace(m.month)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={isAdmin ? '' : 'hidden lg:block'}>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Annual planner</h2>
        <DateStepper unit="year" year={year} onChange={onYearChange}>
          <AnnualLegendTrigger ruleHintIntro={ruleHintIntro} ruleHintBullets={ruleHintBullets} />
        </DateStepper>
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
            <InspectorStat icon={Calendar} label="Approved leave" value={`${annualDaysInRange(approvedRows, selMonthStart, selMonthEnd)} days`} />
            <InspectorStat
              icon={Clock}
              label="Pending requests"
              value={`${pendingRequestCountInRange(pendingRows, selMonthStart, selMonthEnd)} requests`}
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
                        <span className="text-sm font-medium text-ink">{displayNames.get(e.profileId) ?? e.surname}</span>
                        <span className="text-xs text-ink-muted">{labelForLeaveCategory(e.category, e.contractType)}</span>
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
            <Link to="/leave?tab=requests" className="btn-secondary flex w-full items-center justify-center gap-1.5 text-sm">
              <ListChecks className="h-3.5 w-3.5" /> View requests
            </Link>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

// The Annual planner's Legend — a static "Legend" trigger (the day-block
// fill states don't change tick to tick the way Weekend's live gap-count
// does, so there's nothing to surface inline the way MonthLegendTrigger
// does), shared by both the non-admin mobile toolbar and the admin/desktop
// one so neither carries a separate InlineRuleHint icon alongside it.
function AnnualLegendTrigger({ ruleHintIntro, ruleHintBullets }) {
  return (
    <LegendSheet
      trigger={onClick => (
        <button type="button" onClick={onClick} className="btn-secondary h-[30px] px-2.5 text-xs">
          Legend
        </button>
      )}
      ruleIntro={ruleHintIntro}
      ruleBullets={ruleHintBullets}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-muted">
        {LEAVE_CAPACITY_STATES.map(state => (
          <span key={state.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${state.fill}`} /> {state.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink/10 ring-1 ring-inset ring-ink-muted" /> Public holiday</span>
      </div>
    </LegendSheet>
  )
}

// Non-admin mobile's decision-led month row: name, a state chip (colour AND
// text, not colour alone — a colour-vision-safe requirement), and a heat
// strip of the month's daily capacity states in one row rather than a
// calendar grid — reads as "is this month worth a closer look" without
// requiring anyone to count or decode individual day cells first. Tapping
// opens the month workspace directly. The chip's own label carries the
// day-count detail directly for the two states worth quantifying (how many
// days are limited/full) rather than a separate "N pressure days" line
// repeating a coarser version of the same fact.
function CategoryMonthTile({ month, onOpen }) {
  const chipLabel = chipLabelForMonth(month)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-sm font-semibold text-ink">{month.label}</span>
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${month.worstState.tint} ${month.worstState.text}`}>
            {chipLabel}
          </span>
        </div>
        <div className="mt-2 flex gap-[2px]">
          {month.markers.map(d => (
            <span
              key={d.date}
              className={`h-1.5 flex-1 rounded-sm ${d.capacityState.fill}`}
              title={d.publicHolidayName || d.capacityState.label}
            />
          ))}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
    </button>
  )
}

// "Limited"/"At capacity" on their own don't say how many days are actually
// affected — spells out the day count behind the chip's own colour (yellow
// blocks for "limited", red blocks for "at capacity") instead of the
// generic state label. Available/near-capacity keep their plain label —
// "available" needs no count, and near-capacity has no default combination
// of category caps that reaches it (see categoryDayCapacityState in
// annualPlannerOverview.js), so there's nothing to quantify there yet.
function chipLabelForMonth(month) {
  if (month.worstState.key === 'limited') {
    const days = month.markers.filter(d => d.capacityState.key === 'limited').length
    return `Limited capacity on ${days} day${days === 1 ? '' : 's'}`
  }
  if (month.worstState.key === 'at_capacity') {
    const days = month.markers.filter(d => d.capacityState.key === 'at_capacity').length
    return `No capacity on ${days} day${days === 1 ? '' : 's'}`
  }
  return month.worstState.label
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
function MonthCard({ month, isSelected, onSelect }) {
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
          const cellClass = day.capacityState.fill
          // A public holiday keeps its normal capacity-state fill (so the
          // colour stays readable) plus a border in a darker shade of that
          // same colour, rather than swapping the fill for a flat dark
          // block that hid which capacity state the day was actually in.
          const phRing = day.isPublicHoliday ? `ring-1 ring-inset ${day.capacityState.ringDark}` : ''
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
