import { useMemo, useState } from 'react'
import { ExternalLink, Check } from 'lucide-react'
import { monthsForYear } from '../lib/leaveYearGrid'
import { todayStr, parseLocalDate } from '../lib/dateRange'
import { weekendCoverageSummary, formatWeekendRange, weekendExceptionsForMonth } from '../lib/weekendPlanner'
import { monthWeekendMarkers, nextOpenWeekendInYear } from '../lib/weekendYearOverview'
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
export default function WeekendYearOverview({ year, onYearChange, byWeekend, weekendExceptions = [], displayNames = new Map(), onOpenMonth, onPlanWeekend }) {
  const today = todayStr()
  const todayYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(todayYear === year ? currentMonth : 1)

  const months = monthsForYear(year)
  const monthCards = months.map(m => ({ ...m, markers: monthWeekendMarkers(m.year, m.month, byWeekend) }))

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
  const nextOpenWeekendTextClass = nextOpenWeekendCoverage?.filledGroups === 0 ? 'text-flagRed' : 'text-flagAmber'

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

  // Weekend exceptions touching the selected month. A weekend straddling a
  // month boundary is listed under both months on purpose — see
  // weekendExceptionsForMonth.
  const selectedExceptions = useMemo(
    () => weekendExceptionsForMonth(weekendExceptions, year, selectedMonth),
    [weekendExceptions, year, selectedMonth],
  )

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink">Weekend planner</h2>

      {/* ── Main workspace: 3x4 month grid + one sticky rail — bigger cards
          than Annual's own 4-across grid (Weekend cards hold far less
          content — a row of Saturday squares, not a day heatmap — so 3
          across fills the space better without looking sparse). Mobile
          (<lg): rail stacked first, full width. Desktop (lg+): grid + w-72
          sticky rail side by side. ── */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div data-testid="weekend-year-grid" className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 lg:grid-cols-3">
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

        {/* One combined rail card — Selected month / Next weekend as
            sections separated by a divider line, matching
            AnnualPlannerOverview's single-inspector shape. No standalone
            year selector: the Selected month jump sheet already has a year
            stepper (and its own 12-year grid, one tap on the year label
            away — see DateStepper's MonthJumpSheet) that fully covers
            year navigation, and the year-wide totals a "Select year"
            section used to show are redundant with the gap-count/complete
            badges already on every month card in the grid. */}
        <div className="order-first w-full flex-shrink-0 rounded-lg border border-slate-line bg-canvas-raised p-3 lg:order-none lg:sticky lg:top-4 lg:w-72">
          <div data-testid="weekend-year-inspector">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected month</p>
            <div className="mt-1">
              <DateStepper unit="month" year={year} month={selectedMonth} onChange={handleSelectedMonthChange} showToday={false} centered />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-line pt-2">
              <StatCell label="Fully staffed" value={selectedStats.fullyPlanned} colorClass="text-success" bgClass="bg-success-bg" />
              <StatCell label="Need staff" value={selectedStats.partial} colorClass="text-flagAmber" bgClass="bg-flagAmber-bg" />
              <StatCell label="No staff" value={selectedStats.empty} colorClass="text-flagRed" bgClass="bg-flagRed-bg" />
            </div>

            {/* Weekend exceptions for this month — between the staffing
                counts and Open month, because they qualify those counts: a
                pending exception means the plan above isn't settled yet.
                Both approved and pending are listed (pending italicised and
                badged, matching the leave planners' pending treatment), and
                a boundary-straddling weekend appears under both its months.
                These are NOT special leave and carry no special-leave
                capacity weight — they're an exception to WHICH weekend a
                doctor works, still approved via Planners -> Requests. The
                section is omitted entirely when the month has none, rather
                than showing an empty-state line, so the common case keeps
                the rail short. */}
            {selectedExceptions.length > 0 && (
              <div data-testid="weekend-exception-list" className="mt-2 border-t border-slate-line pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Weekend exceptions ({selectedExceptions.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {selectedExceptions.map(req => {
                    const isPending = req.status === 'pending'
                    return (
                      <li key={req.id} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className={`min-w-0 truncate ${isPending ? 'italic text-ink-light' : 'text-ink'}`}>
                          <span className="font-semibold">
                            {displayNames.get(req.profile_id) || req.profiles?.surname || '?'}
                          </span>
                          <span className="text-ink-muted"> · {formatWeekendRange(req.date_from)}</span>
                        </span>
                        <span
                          className={`flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold uppercase leading-none ${
                            isPending ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
                          }`}
                        >
                          {isPending ? 'Pending' : 'Approved'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => onOpenMonth(selectedMonth)}
              className="btn-primary mt-2 flex w-full items-center justify-center gap-1.5 text-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open month
            </button>
          </div>

          {/* Next weekend needing staff — finding the nearest open weekend
              across the whole year belongs with the page that already has
              the whole year loaded. Omitted once every remaining weekend
              this year is fully staffed. Below Selected month rather than
              above it, since Selected month is the section someone's
              actively working from. Urgency still reads via the coloured
              date line (nextOpenWeekendTextClass), not a full tinted
              section background — matches Annual's plain-section styling. */}
          {nextOpenWeekend && (
            <div className="mt-3 border-t border-slate-line pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next weekend needing staff</p>
              <p className={`mt-0.5 text-base font-semibold ${nextOpenWeekendTextClass}`}>{formatWeekendRange(nextOpenWeekend)}</p>
              <p className="mt-1 text-sm text-ink-light">
                {nextOpenWeekendCoverage.filledGroups} of {nextOpenWeekendCoverage.totalGroups} groups staffed
              </p>
              <button
                type="button"
                onClick={() => onPlanWeekend(nextOpenWeekend)}
                className="btn-primary mt-2 flex w-full items-center justify-center gap-1.5 text-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Plan now
              </button>
            </div>
          )}
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
    <div className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-center ${bgClass}`}>
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`text-xl font-semibold ${colorClass}`}>{value}</span>
    </div>
  )
}

// One month's compact overview: title + a single row of small squares, one
// per Saturday that month (4, occasionally 5), filled by that weekend's
// health state with a small corner badge — a gap count for anything still
// open, or a solid check for a fully-planned one, so "complete" reads at a
// glance without needing the year-wide totals a separate Select year
// section used to spell out. Mirrors AppLayout.jsx's notification-count
// badge styling for that corner marker.
function WeekendMonthCard({ month, isSelected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`card p-3 text-left transition-colors ${isSelected ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/40'}`}
    >
      <span className="font-display text-sm font-semibold text-ink">{month.label}</span>
      <div className="mt-2.5 flex flex-wrap gap-2 lg:gap-3">
        {month.markers.map(m => {
          const style = HEALTH_STYLE[m.health]
          return (
            <span
              key={m.saturday}
              className="relative h-8 w-8 lg:h-9 lg:w-12"
              title={`${formatShortDate(m.saturday)} — ${style.label}${m.gapCount > 0 ? ` (${m.gapCount} ${m.gapCount === 1 ? 'gap' : 'gaps'})` : ''}`}
            >
              <span className={`block h-8 w-8 rounded-md lg:h-9 lg:w-12 ${style.square}`} />
              {m.gapCount > 0 ? (
                <span className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none text-white ring-1 ring-canvas-raised ${
                  m.health === 'red' ? 'bg-flagRed' : 'bg-flagAmber'
                }`}>
                  {m.gapCount}
                </span>
              ) : (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-success text-white ring-1 ring-canvas-raised">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </span>
          )
        })}
      </div>
    </button>
  )
}
