import { useMemo, useState } from 'react'
import Modal from './Modal'
import PlannerRequestPanel, { PANEL_RAIL } from './PlannerRequestPanel'
import PlannerDetailsCard from './PlannerDetailsCard'
import MonthSummary from './annual/MonthSummary'
import LeaveRequestForm from './LeaveRequestForm'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { monthsForYear, LEAVE_CAPACITY_STATES, LEAVE_CAPACITY_COLUMNS, totalLeaveSlotsForDate } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { annualDaysInRange, pendingRequestCountInRange } from '../lib/leaveDashboard'
import {
  pressureDatesInYear, monthDayMarkers, monthSummaryLine, entriesInRange, monthCapacityMarkers,
} from '../lib/annualPlannerOverview'
import { daysBySlotsUsed } from '../lib/plannerCalendar'
import { monthBounds, todayStr, dayOfWeek } from '../lib/dateRange'
import SelectMenu from './SelectMenu'
import LegendSheet from './LegendSheet'
import DateStepper from './DateStepper'
import { LegendIcon } from './PlannerIcons'

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
  ruleHintIntro, ruleHintBullets, onRequestSubmitted,
}) {
  const { isAdmin } = useAuth()
  const [requestOpen, setRequestOpen] = useState(false)
  const today = todayStr()
  const currentMonth = Number(today.slice(5, 7))
  const todayYear = Number(today.slice(0, 4))
  // The month the SELECTED MONTH card is about — set by clicking a month in
  // the year grid, never by a stepper of its own: the page's one period
  // control is the year stepper in the request panel.
  const [selectedMonth, setSelectedMonth] = useState(todayYear === year ? currentMonth : 1)

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
  // The same read feeds two card shapes — the mobile tile and, for a
  // non-admin, the desktop month card — so it is computed once here rather
  // than twice with a chance of drifting.
  const capacityByMonth = new Map(months.map(m => {
    const markers = monthCapacityMarkers(m.year, m.month, categoryKey, { countByColumnPerDate, maxByColumnKey, publicHolidaysByDate })
    const worstState = markers.reduce(
      (worst, d) => LEAVE_CAPACITY_STATES.indexOf(d.capacityState) > LEAVE_CAPACITY_STATES.indexOf(worst) ? d.capacityState : worst,
      LEAVE_CAPACITY_STATES[0]
    )
    return [m.month, { markers, worstState }]
  }))
  const categoryMonthCards = months.map(m => ({ ...m, ...capacityByMonth.get(m.month) }))

  const monthCards = months.map(m => {
    const markers = monthDayMarkers(m.year, m.month, {
      approvedByDate, pendingByDate, pressureDates, publicHolidaysByDate, countByColumnPerDate,
    })
    const pressureDayCount = markers.filter(d => d.isPressure).length
    const { start, end } = monthBounds(m.year, m.month)
    const pendingCount = pendingRequestCountInRange(pendingRows, start, end)
    const capacity = capacityByMonth.get(m.month)
    return {
      ...m, markers, pressureDayCount, pendingCount,
      summaryLine: monthSummaryLine({ pressureDayCount, pendingCount }),
      capacityMarkers: capacity.markers, worstState: capacity.worstState,
    }
  })

  // Category-scoped month list for the non-admin mobile view (see the
  // render below) — each month's capacity read for just categoryKey (or the
  // blended total for 'all'), grouped by time (Current/Coming/Previous month
  // relative to today) rather than the uniform 12-tile catalogue admins/
  // desktop still get. worstState drives the tile's label chip: the most
  // severe state reached that month, so a single day at capacity still
  // surfaces even if most of the month is clear.
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

  const selectedMonthLabel = months[selectedMonth - 1].label
  const { start: selMonthStart, end: selMonthEnd } = monthBounds(year, selectedMonth)

  // The SELECTED MONTH card's reading: everyone on leave in the month
  // (approved first, then pending), the stat row, and the month's slot
  // buckets for the capacity bar — every day, from 0 of 3 used to full.
  const monthEntries = entriesInRange(selMonthStart, selMonthEnd, { approvedByDate, pendingByDate })
  const overlapping = rows => rows.filter(r => r.date_from <= selMonthEnd && r.date_to >= selMonthStart)
  const monthStats = {
    approved: { days: annualDaysInRange(approvedRows, selMonthStart, selMonthEnd), requests: overlapping(approvedRows).length },
    pending: { days: annualDaysInRange(pendingRows, selMonthStart, selMonthEnd), requests: overlapping(pendingRows).length },
  }
  const monthBuckets = daysBySlotsUsed(year, selectedMonth, d => totalLeaveSlotsForDate(d, countByColumnPerDate))

  // The same request panel every planner leads with, on every viewport:
  // the eyebrow names the planner and the view, the year stepper under it
  // is the page's only period control, "Showing" sets whose capacity the
  // months report, and the request action sits under that. The picker is
  // a doctor's control only — the admin dashboard's cards read
  // departmental pressure, which no category narrows (see the mobile
  // finder's comment below), so an admin's panel is just the year.
  // `id` differs per viewport: jsdom (and a real browser at a breakpoint
  // boundary) has both copies in the document, and two controls can't
  // share one id or the label points at whichever came first.
  function renderRequestPanel(id) {
    return (
      <PlannerRequestPanel
        eyebrow="Annual leave · Overview"
        stepper={<DateStepper unit="year" year={year} onChange={onYearChange} showToday={false} centered />}
        actionLabel="Request annual leave"
        onAction={() => setRequestOpen(true)}
      >
        {!isAdmin && (
          <>
            <label htmlFor={id} className="mt-2 block text-[11px] font-semibold text-ink-muted">Showing</label>
            <div className="mt-1">
              <SelectMenu id={id} value={categoryKey} onChange={setCategoryKey} options={CATEGORY_FILTER_OPTIONS} />
            </div>
          </>
        )}
      </PlannerRequestPanel>
    )
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
            <h2 className="font-display text-lg font-semibold text-ink">Annual Leave Planner</h2>
            <AnnualLegendTrigger ruleHintIntro={ruleHintIntro} ruleHintBullets={ruleHintBullets} />
          </div>

          {/* Above the months, not beside the title: it changes what every
              tile below means, so it reads as the heading for the list. */}
          <div className="mt-3">{renderRequestPanel('annual-capacity-mobile')}</div>

          {/* Current month leads — the one question a doctor lands on this
              page to answer is "can I take leave soon," so it renders first,
              never below a scroll. Coming/Previous below it are just the
              same tiles split by time instead of by best/worst, so nothing
              needs a tap to reveal it. */}
          {currentMonthCard && (
            <div className="mt-4">
              <p className="sheen-divider">Current month</p>
              <div className="mt-2 space-y-2">
                <CategoryMonthTile month={currentMonthCard} onOpen={() => onOpenWorkspace(currentMonthCard.month)} />
              </div>
            </div>
          )}

          {comingMonthCards.length > 0 && (
            <div className="mt-4">
              <p className="sheen-divider">Coming months</p>
              <div className="mt-2 space-y-2">
                {comingMonthCards.map(m => (
                  <CategoryMonthTile key={m.month} month={m} onOpen={() => onOpenWorkspace(m.month)} />
                ))}
              </div>
            </div>
          )}

          {previousMonthCards.length > 0 && (
            <div className="mt-4">
              <p className="sheen-divider">Previous months</p>
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
        <h2 className="font-display text-lg font-semibold text-ink">Annual Leave Planner</h2>
        <AnnualLegendTrigger ruleHintIntro={ruleHintIntro} ruleHintBullets={ruleHintBullets} />
      </div>

      {/* ── Main workspace: 3x4 month grid + sticky rail ── */}
      {/* Mobile (<lg, admins only — doctors get the finder above): stacked,
          full width, rail shown first so the request panel and the
          currently-selected month's detail are visible without scrolling
          past the whole grid. Desktop (lg+): side by side, the rail sticky
          at w-80 — request panel on top, Selected month inspector under
          it, both the same width so they share an edge. */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div data-testid="annual-year-grid" className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 lg:grid-cols-3">
          {monthCards.map(m => (
            <MonthCard
              key={m.month}
              month={m}
              isSelected={m.month === selectedMonth}
              isAdmin={isAdmin}
              // Clicking an unselected month just selects it (updating the
              // inspector); clicking the already-selected one goes straight
              // to its month workspace — a second click on the same month
              // reads as "open this," not "select this again."
              onSelect={() => m.month === selectedMonth ? onOpenWorkspace(m.month) : setSelectedMonth(m.month)}
            />
          ))}
        </div>

        <div className={PANEL_RAIL}>
        {renderRequestPanel('annual-capacity-desktop')}
        {/* The month under the cursor, set by the grid: a plain label, not
            a second stepper. */}
        <div data-testid="annual-inspector" className="mt-3">
          <PlannerDetailsCard eyebrow="Selected month" title={`${selectedMonthLabel} ${year}`}>
            <MonthSummary
              stats={monthStats}
              buckets={monthBuckets}
              totalDays={monthBuckets.reduce((sum, b) => sum + b.days, 0)}
              fullDays={monthBuckets[monthBuckets.length - 1].days}
              entries={monthEntries}
              displayNames={displayNames}
              isAdmin={isAdmin}
              onOpenMonth={() => onOpenWorkspace(selectedMonth)}
              requestsHref="/leave?tab=requests&from=annual"
            />
          </PlannerDetailsCard>
        </div>
        </div>
      </div>
      </div>

      {requestOpen && (
        <Modal title="Request annual leave" onClose={() => setRequestOpen(false)} centered>
          <LeaveRequestForm initialLeaveType="annual" onSubmitted={() => { setRequestOpen(false); onRequestSubmitted?.() }} />
        </Modal>
      )}
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
        <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-utility h-[30px] w-[30px] p-0">
          <LegendIcon className="h-4 w-4" />
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
  const chipLabel = chipLabelForMonth(month.worstState, month.markers)
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
function chipLabelForMonth(worstState, markers) {
  if (worstState.key === 'limited') {
    const days = markers.filter(d => d.capacityState.key === 'limited').length
    return `Limited capacity on ${days} day${days === 1 ? '' : 's'}`
  }
  if (worstState.key === 'at_capacity') {
    const days = markers.filter(d => d.capacityState.key === 'at_capacity').length
    return `No capacity on ${days} day${days === 1 ? '' : 's'}`
  }
  return worstState.label
}

// One month's compact overview: title, a quiet one-line summary, and a
// calendar-shaped grid of small day markers rather than a dense day-row
// table — each day block is filled solid by its capacity state (green =
// available, yellow = limited, orange = near capacity, red = at capacity),
// so the grid reads as a heatmap of "can I take leave here" at a glance
// rather than requiring a tap to find out.
function MonthCard({ month, isSelected, onSelect, isAdmin }) {
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
      {/* "2 pressure days · 1 pending" answers an admin's question — how much
          is this month going to cost me to run. A doctor is asking whether
          they can take leave, which is what the capacity chip says, and it
          is the same wording their phone already gives them. */}
      {isAdmin ? (
        <p className="mt-0.5 text-xs text-ink-muted">{month.summaryLine}</p>
      ) : (
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${month.worstState.tint} ${month.worstState.text}`}>
          {chipLabelForMonth(month.worstState, month.capacityMarkers)}
        </span>
      )}

      {/* Bigger cells than the tight 4x3-grid days had — brings the block's
          overall height up closer to the Weekend planner's own month
          cards, and a small fixed radius on a 14px cell reads as a rounded
          square rather than the near-circle the same radius gave at 8px. */}
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} className="h-3.5 w-3.5" />
          const cellClass = day.capacityState.fill
          // A public holiday keeps its normal capacity-state fill (so the
          // colour stays readable) plus a border in a darker shade of that
          // same colour, rather than swapping the fill for a flat dark
          // block that hid which capacity state the day was actually in.
          const phRing = day.isPublicHoliday ? `ring-1 ring-inset ${day.capacityState.ringDark}` : ''
          return (
            <span key={day.date} className="h-3.5 w-3.5" title={day.publicHolidayName || `${day.capacityState.label} (${day.totalSlots} of 3)`}>
              <span className={`block h-3.5 w-3.5 rounded-sm ${cellClass} ${phRing}`} />
            </span>
          )
        })}
      </div>
    </button>
  )
}
