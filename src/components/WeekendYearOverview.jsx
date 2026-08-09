import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { monthsForYear } from '../lib/leaveYearGrid'
import { todayStr, parseLocalDate } from '../lib/dateRange'
import { monthWeekendMarkers, yearWeekendTotals } from '../lib/weekendYearOverview'
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
export default function WeekendYearOverview({ year, onYearChange, byWeekend, onOpenMonth }) {
  const today = todayStr()
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(Number(today.slice(0, 4)) === year ? currentMonth : 1)

  const months = monthsForYear(year)
  const monthCards = months.map(m => ({ ...m, markers: monthWeekendMarkers(m.year, m.month, byWeekend) }))
  const totals = yearWeekendTotals(year, byWeekend)

  const selectedMonthLabel = months[selectedMonth - 1].label
  const selectedMarkers = monthCards[selectedMonth - 1].markers
  const selectedStats = {
    fullyPlanned: selectedMarkers.filter(m => m.health === 'green').length,
    partial: selectedMarkers.filter(m => m.health === 'amber').length,
    empty: selectedMarkers.filter(m => m.health === 'red').length,
  }

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Weekend planner</h2>
        <DateStepper unit="year" year={year} onChange={onYearChange} />
      </div>

      {/* ── Legend ── */}
      <div data-testid="weekend-year-legend" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {Object.values(HEALTH_STYLE).map(state => (
          <span key={state.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${state.swatch}`} /> {state.label}
          </span>
        ))}
      </div>

      {/* ── Main workspace: 4x3 month grid + sticky inspector ── */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 xl:grid-cols-4">
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

        <div
          data-testid="weekend-year-inspector"
          className="order-first w-full flex-shrink-0 rounded-lg border border-slate-line bg-canvas-raised p-4 lg:order-none lg:sticky lg:top-4 lg:w-80"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected month</p>
          <p className="mt-1 text-lg font-semibold text-ink">{selectedMonthLabel} {year}</p>

          <div className="mt-3 space-y-2 border-t border-slate-line pt-3">
            <StatRow label="Fully planned" value={selectedStats.fullyPlanned} colorClass="text-success" />
            <StatRow label="Needs staff" value={selectedStats.partial} colorClass="text-flagAmber" />
            <StatRow label="Empty" value={selectedStats.empty} colorClass="text-flagRed" />
          </div>

          <div className="mt-3 space-y-2 border-t border-slate-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">This year</p>
            <StatRow label="Fully planned" value={totals.fullyPlanned} colorClass="text-success" />
            <StatRow label="Needs staff" value={totals.partial} colorClass="text-flagAmber" />
            <StatRow label="Empty" value={totals.empty} colorClass="text-flagRed" />
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
  )
}

function StatRow({ label, value, colorClass }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className={`font-medium ${colorClass}`}>{value}</span>
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
