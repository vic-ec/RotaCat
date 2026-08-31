import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, ExternalLink, ListChecks } from 'lucide-react'
import { monthsForYear, LEAVE_CAPACITY_STATES } from '../lib/leaveYearGrid'
import { SPECIAL_LEAVE_SOFT_CAP, shortLeaveTypeLabel } from '../lib/leaveRequests'
import { formatShortDateRange, todayStr } from '../lib/dateRange'
import {
  specialCountsByDate, specialMonthMarkers, leadingBlanksForMonth, specialMonthStats, specialMonthEntries,
} from '../lib/specialPlanner'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'
import DateStepper from './DateStepper'
import LegendSheet from './LegendSheet'
import { LegendIcon } from './PlannerIcons'

// The Special planner's 12-month landing view — the direct counterpart of
// AnnualPlannerOverview, deliberately the same shape (toolbar, 3x4 month
// grid, sticky inspector rail) so the two planner tabs read as one system
// rather than two unrelated screens. It replaces the year-long day-row
// spreadsheet this tab used to show on desktop, which shared nothing with
// the Annual planner beyond the data behind it.
//
// The one real difference is what the colours mean. Annual has enforced
// per-category caps; special leave has only the EC Leave Planner sheet's
// documented guideline of no more than SPECIAL_LEAVE_SOFT_CAP doctors at
// once. So the day cells read as pressure against that guideline, using
// Annual's own capacityStateForCount (which clamps at 3) so an identical
// headcount is an identical colour on both tabs.
export default function SpecialPlannerOverview({
  year, onYearChange, leaveByDate, displayNames = new Map(), publicHolidaysByDate = new Map(),
  onOpenWorkspace, ruleIntro, ruleBullets,
}) {
  const today = todayStr()
  const todayYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(todayYear === year ? currentMonth : 1)

  const countsByDate = specialCountsByDate(leaveByDate)
  const monthCards = monthsForYear(year).map(m => {
    const markers = specialMonthMarkers(m.year, m.month, countsByDate, publicHolidaysByDate)
    const stats = specialMonthStats(m.year, m.month, leaveByDate, countsByDate)
    return { ...m, markers, stats }
  })

  const selected = monthCards[selectedMonth - 1]
  const selectedEntries = specialMonthEntries(year, selectedMonth, leaveByDate)

  // DateStepper handles the Dec/Jan rollover itself, calling back with
  // whichever year the stepped-to month landed in — only forward that up
  // when it differs from the year already being browsed.
  function handleSelectedMonthChange(y, m) {
    if (y !== year) onYearChange(y)
    setSelectedMonth(m)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Special planner</h2>
        <SpecialLegendTrigger ruleIntro={ruleIntro} ruleBullets={ruleBullets} />
      </div>

      {/* Mobile (<lg): stacked, inspector first so the selected month's
          detail is readable without scrolling past the whole grid.
          Desktop (lg+): grid and sticky rail side by side. Same split
          AnnualPlannerOverview uses. */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div data-testid="special-year-grid" className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 lg:grid-cols-3">
          {monthCards.map(m => (
            <MonthCard
              key={m.month}
              month={m}
              isSelected={m.month === selectedMonth}
              // Clicking an unselected month selects it; clicking the
              // already-selected one opens it — a second click on the same
              // card reads as "open this", not "select this again".
              onSelect={() => m.month === selectedMonth ? onOpenWorkspace(m.month) : setSelectedMonth(m.month)}
            />
          ))}
        </div>

        <div
          data-testid="special-inspector"
          className="order-first w-full flex-shrink-0 rounded-lg border border-slate-line bg-canvas-raised p-4 lg:order-none lg:sticky lg:top-4 lg:w-80"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected month</p>
          <div className="mt-1">
            <DateStepper unit="month" year={year} month={selectedMonth} onChange={handleSelectedMonthChange} showToday={false} centered />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-line pt-3">
            <InspectorStat icon={Calendar} label="Approved" value={`${selected.stats.approved} ${selected.stats.approved === 1 ? 'request' : 'requests'}`} />
            <InspectorStat icon={Clock} label="Pending" value={`${selected.stats.pending} ${selected.stats.pending === 1 ? 'request' : 'requests'}`} />
          </div>

          {/* The guideline, reported rather than enforced — see
              SPECIAL_LEAVE_SOFT_CAP. Omitted at zero: "0 days above the
              guideline" is not news, and the Annual planner's equivalent
              tile row is a genuine utilisation breakdown this has no
              counterpart for. */}
          {selected.stats.pressureDays > 0 && (
            <div className="mt-3 border-t border-slate-line pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Above guideline</p>
              <p className="mt-1 text-sm text-ink-light">
                <span className="font-semibold text-flagAmber">{selected.stats.pressureDays}</span>
                {' '}{selected.stats.pressureDays === 1 ? 'day has' : 'days have'} {SPECIAL_LEAVE_SOFT_CAP}+ doctors on special leave at once.
              </p>
            </div>
          )}

          {selectedEntries.length > 0 ? (
            <div className="mt-3 border-t border-slate-line pt-3">
              <p className="text-sm font-semibold text-ink">Leave in {selected.label}</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {selected.stats.people} {selected.stats.people === 1 ? 'person' : 'people'} · {selected.stats.approved} approved · {selected.stats.pending} pending
              </p>
              <ul data-testid="special-month-entries" className="mt-2 space-y-0.5">
                {selectedEntries.map(e => (
                  <li key={`${e.profileId}-${e.leaveType}-${e.dateFrom}`} className="flex items-baseline justify-between gap-1.5 px-1 py-1 text-sm">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="flex-shrink-0 font-medium text-ink">{displayNames.get(e.profileId) ?? e.surname}</span>
                      <span className="truncate text-xs text-ink-muted">
                        {shortLeaveTypeLabel(e.leaveType)} · {formatShortDateRange(e.dateFrom, e.dateTo)}
                      </span>
                    </span>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      e.status === 'pending' ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
                    }`}>
                      {e.status === 'pending' ? REVIEW_STATUS_LABELS.pending : 'Approved'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 border-t border-slate-line pt-3 text-sm text-ink-muted">No leave this month.</p>
          )}

          <div className="mt-4 space-y-2">
            <button type="button" onClick={() => onOpenWorkspace(selectedMonth)} className="btn-primary flex w-full items-center justify-center gap-1.5 text-sm">
              <ExternalLink className="h-3.5 w-3.5" /> Open month
            </button>
            <Link to="/leave?tab=requests&from=special" className="btn-secondary flex w-full items-center justify-center gap-1.5 text-sm">
              <ListChecks className="h-3.5 w-3.5" /> View requests
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// Same trigger the Annual planner uses, and the same single entry point to
// both the colour key and the rules (see LegendSheet).
export function SpecialLegendTrigger({ ruleIntro, ruleBullets }) {
  return (
    <LegendSheet
      ruleIntro={ruleIntro}
      ruleBullets={ruleBullets}
      trigger={onClick => (
        <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-secondary h-[30px] w-[30px] p-0">
          <LegendIcon className="h-4 w-4" />
        </button>
      )}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-muted">
        {LEAVE_CAPACITY_STATES.map((state, i) => (
          <span key={state.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${state.fill}`} />
            {i === 0 ? 'Nobody' : i >= SPECIAL_LEAVE_SOFT_CAP ? `${SPECIAL_LEAVE_SOFT_CAP}+ (above guideline)` : `${i} on leave`}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink/10 ring-1 ring-inset ring-ink-muted" /> Public holiday</span>
      </div>
    </LegendSheet>
  )
}

function InspectorStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted" />
      <span className="min-w-0">
        <span className="block text-xs text-ink-muted">{label}</span>
        <span className="block text-sm font-semibold text-ink">{value}</span>
      </span>
    </div>
  )
}

// One month at a glance: label, a one-line summary, and a Monday-start
// mini-calendar coloured by how many doctors are on special leave each
// day. Same card shape as AnnualPlannerOverview's MonthCard.
function MonthCard({ month, isSelected, onSelect }) {
  const cells = [...Array(leadingBlanksForMonth(month.markers)).fill(null), ...month.markers]
  const summary = month.stats.people === 0
    ? 'Nobody on leave'
    : `${month.stats.people} ${month.stats.people === 1 ? 'person' : 'people'} · ${month.stats.pending} pending`

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
      <p className="mt-0.5 text-xs text-ink-muted">{summary}</p>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} className="h-3.5 w-3.5" />
          // A public holiday keeps its pressure fill and gains a ring in a
          // darker shade of the same colour, rather than swapping to a flat
          // block that would hide the count — same treatment as Annual's.
          const phRing = day.isPublicHoliday ? `ring-1 ring-inset ${day.capacityState.ringDark}` : ''
          return (
            <span key={day.date} className="h-3.5 w-3.5" title={day.publicHolidayName || `${day.count} on special leave`}>
              <span className={`block h-3.5 w-3.5 rounded-sm ${day.capacityState.fill} ${phRing}`} />
            </span>
          )
        })}
      </div>
    </button>
  )
}
