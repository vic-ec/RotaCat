import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { monthsForYear } from '../lib/leaveYearGrid'
import { todayStr, parseLocalDate } from '../lib/dateRange'
import { weekendCoverageSummary, formatWeekendRange } from '../lib/weekendPlanner'
import { monthWeekendMarkers, yearWeekendTotals, nextOpenWeekendInYear } from '../lib/weekendYearOverview'
import DateStepper from './DateStepper'

// Small square fill + legend swatch + label per health state — kept to the
// flagRed/flagAmber-bg+flagAmber/success-bg+success roster-state tokens
// (never the capAvailable/capLimited/capNear/capAtCapacity palette, which is
// reserved for the Leave planner's day-capacity heatmap, a different
// concept). Red is a solid fill rather than the -bg+text pairing amber/green
// use — "empty" is the one state genuinely worth calling out at a glance.
const HEALTH_STYLE = {
  green: { square: 'bg-success-bg', swatch: 'bg-success', label: 'Fully planned' },
  amber: { square: 'bg-flagAmber-bg', swatch: 'bg-flagAmber', label: 'Needs staff' },
  red: { square: 'bg-flagRed-bg', swatch: 'bg-flagRed', label: 'Empty' },
}

function formatShortDate(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// The Weekend Planner's year-overview landing page for admins/clerks — a
// 12-month "which weekends still need staffing" dashboard that fronts the
// existing month-at-a-time grid (WeekendPlannerView, opened via
// onOpenMonth), mirroring AnnualPlannerOverview.jsx's shape for the Annual
// Leave planner. byWeekend is the { [saturday]: { [groupKey]: [entry,...] } }
// Map from groupEntriesByWeekend — the same shape WeekendPlannerView itself
// already works with.
export default function WeekendYearOverview({ year, onYearChange, byWeekend, onOpenMonth, onPlanWeekend }) {
  const today = todayStr()
  const todayYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(todayYear === year ? currentMonth : 1)

  const months = monthsForYear(year)
  const monthCards = months.map(m => ({ ...m, markers: monthWeekendMarkers(m.year, m.month, byWeekend) }))
  const totals = yearWeekendTotals(year, byWeekend)

  const selectedMarkers = monthCards[selectedMonth - 1].markers

  // The nearest weekend (today or later) still short a role, across the
  // whole year already loaded here — not just the currently selected
  // month. Its "Plan now" hands off to WeekendPlannerView (via
  // onPlanWeekend), which scrolls to and opens that exact weekend's
  // add-doctor picker on mount. By definition it's never fully staffed
  // (that's what "needing staff" means), so its fill is only ever amber
  // (some groups filled) or red (none) — the two "still short" HEALTH_STYLE
  // colors, never green.
  const nextOpenWeekend = nextOpenWeekendInYear(year, byWeekend, today)
  const nextOpenWeekendCoverage = nextOpenWeekend ? weekendCoverageSummary(byWeekend.get(nextOpenWeekend)) : null
  const nextOpenWeekendFill = nextOpenWeekendCoverage?.filledGroups === 0
    ? { bg: 'bg-flagRed-bg', text: 'text-flagRed' }
    : { bg: 'bg-flagAmber-bg', text: 'text-flagAmber' }

  // Selected-month chevrons/jump-sheet: DateStepper itself handles the
  // Dec/Jan year rollover, calling back with whichever year the stepped-to
  // month landed in — only forward that to onYearChange when it's actually
  // different from the year this page is already browsing.
  function handleSelectedMonthChange(y, m) {
    if (y !== year) onYearChange(y)
    setSelectedMonth(m)
  }
  const selectedStats = {
    fullyPlanned: selectedMarkers.filter(m => m.health === 'green').length,
    partial: selectedMarkers.filter(m => m.health === 'amber').length,
    empty: selectedMarkers.filter(m => m.health === 'red').length,
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink">Weekend planner</h2>

      {/* ── Main workspace: 4x3 month grid + one sticky rail — same shell as
          AnnualPlannerOverview's (grid left, single right-hand rail), rather
          than the year/next-weekend panels sitting as their own full-width
          blocks above the grid. Mobile (<lg): rail stacked first, full
          width. Desktop (lg+): grid + w-80 sticky rail side by side. ── */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div data-testid="weekend-year-grid" className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 lg:grid-cols-4">
          {monthCards.map(m => (
            <WeekendMonthCard
              key={m.month}
              month={m}
              isSelected={m.month === selectedMonth}
              // Clicking an unselected month just selects it (updating the
              // inspector); clicking the already-selected one opens its
              // month view — a second click on the same month reads as
              // "open this," not "select this again" (same interaction as
              // AnnualPlannerOverview's MonthCard).
              onSelect={() => m.month === selectedMonth ? onOpenMonth(m.month) : setSelectedMonth(m.month)}
            />
          ))}
        </div>

        <div className="order-first flex w-full flex-shrink-0 flex-col gap-4 lg:order-none lg:sticky lg:top-4 lg:w-80">
          {/* Year selector (chevrons at the panel margins, same `centered`
              layout as the Selected month panel's own stepper below) plus
              the year's totals — each stat cell's fill already doubles as
              the legend, so no separate Legend trigger is needed here. */}
          <div data-testid="weekend-year-stats" className="rounded-lg border border-slate-line bg-canvas-raised p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Select year</p>
            <div className="mt-1">
              <DateStepper unit="year" year={year} onChange={onYearChange} showToday={false} centered />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-line pt-3">
              <StatCell label="Fully staffed" value={totals.fullyPlanned} colorClass="text-success" bgClass="bg-success-bg" />
              <StatCell label="Need staff" value={totals.partial} colorClass="text-flagAmber" bgClass="bg-flagAmber-bg" />
              <StatCell label="No staff" value={totals.empty} colorClass="text-flagRed" bgClass="bg-flagRed-bg" />
            </div>
          </div>

          {/* Next weekend needing staff — finding the nearest open weekend
              across the whole year belongs with the page that already has
              the whole year loaded. Omitted once every remaining weekend
              this year is fully staffed. */}
          {nextOpenWeekend && (
            <div className={`card p-4 ${nextOpenWeekendFill.bg}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next weekend needing staff</p>
              <p className={`mt-0.5 text-base font-semibold ${nextOpenWeekendFill.text}`}>{formatWeekendRange(nextOpenWeekend)}</p>
              <p className="mt-1 text-sm text-ink-light">
                {nextOpenWeekendCoverage.filledGroups} of {nextOpenWeekendCoverage.totalGroups} groups staffed
              </p>
              <button
                type="button"
                onClick={() => onPlanWeekend(nextOpenWeekend)}
                className="btn-primary mt-3 flex w-full items-center justify-center gap-1.5 text-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Plan now
              </button>
            </div>
          )}

          <div data-testid="weekend-year-inspector" className="rounded-lg border border-slate-line bg-canvas-raised p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected month</p>
            <div className="mt-1">
              <DateStepper unit="month" year={year} month={selectedMonth} onChange={handleSelectedMonthChange} showToday={false} centered />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-line pt-3">
              <StatCell label="Fully staffed" value={selectedStats.fullyPlanned} colorClass="text-success" bgClass="bg-success-bg" />
              <StatCell label="Need staff" value={selectedStats.partial} colorClass="text-flagAmber" bgClass="bg-flagAmber-bg" />
              <StatCell label="No staff" value={selectedStats.empty} colorClass="text-flagRed" bgClass="bg-flagRed-bg" />
            </div>

            <button
              type="button"
              onClick={() => onOpenMonth(selectedMonth)}
              className="btn-primary mt-4 flex w-full items-center justify-center gap-1.5 text-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open month
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 3-up grid cell: label on top, big number below, tinted with the same
// -bg fill HEALTH_STYLE uses for the month-grid squares — replaces a
// label/value row so all three counts (fully staffed / needing staff / no
// staff) line up side by side instead of stacking, and the color itself
// (not just the text) doubles as the legend at a glance.
function StatCell({ label, value, colorClass, bgClass }) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-lg py-2 text-center ${bgClass}`}>
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`text-xl font-semibold ${colorClass}`}>{value}</span>
    </div>
  )
}

// One month's compact overview: title + a single row of small squares, one
// per Saturday that month (4, occasionally 5), filled by that weekend's
// health state with a small corner badge showing its gap count — omitted
// when there's nothing open, so a fully green square stays clean. Mirrors
// AppLayout.jsx's notification-count badge styling for that corner marker.
function WeekendMonthCard({ month, isSelected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`card p-3 text-left transition-colors ${isSelected ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/40'}`}
    >
      <span className="font-display text-sm font-semibold text-ink">{month.label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {month.markers.map(m => {
          const style = HEALTH_STYLE[m.health]
          return (
            <span
              key={m.saturday}
              className="relative h-6 w-6"
              title={`${formatShortDate(m.saturday)} — ${style.label}${m.gapCount > 0 ? ` (${m.gapCount} ${m.gapCount === 1 ? 'gap' : 'gaps'})` : ''}`}
            >
              <span className={`block h-6 w-6 rounded-sm ${style.square}`} />
              {m.gapCount > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-flagRed px-1 text-[9px] font-semibold leading-none text-white ring-1 ring-canvas-raised">
                  {m.gapCount}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </button>
  )
}
