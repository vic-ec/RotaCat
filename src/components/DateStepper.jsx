import { monthsForYear } from '../lib/leaveYearGrid'

// month+delta with Dec/Jan year rollover — delta is always ±1 here (prev/
// next), never an arbitrary jump.
function stepMonth(year, month, delta) {
  let m = month + delta
  let y = year
  if (m < 1) { m = 12; y -= 1 }
  else if (m > 12) { m = 1; y += 1 }
  return [y, m]
}

// The app's one shared "browse by year" / "browse by month" control — prev/
// next arrows, a label, and an optional Today reset. Previously hand-rolled
// four times with drifting button sizes and copy-pasted rollover logic
// (AnnualPlannerOverview, MonthWorkspace, WeekendPlannerView, LeaveYearGrid).
//
// `unit="month"` additionally handles the Dec/Jan year rollover; `unit=
// "year"` steps the year alone — `onChange` is always called as
// `(nextYear, nextMonth?)`, so a year-only caller's single-arg handler just
// ignores the second argument.
//
// Bounds-checking (canGoPrev/canGoNext) is opt-in and defaults to always-
// enabled: only WeekendPlannerView's rolling fetch window has real edges to
// disable at — the other call sites can browse freely, so forcing bounds
// checks on them would be pretending a constraint they don't have.
//
// Page-specific extras (a "← Back" link, a Legend toggle, a rule-hint icon)
// are deliberately NOT part of this component's API — pass them as
// `children`, rendered in the same row after the Today button, rather than
// baking page context into a shared control.
export default function DateStepper({
  unit, year, month, onChange, showToday = true, canGoPrev = true, canGoNext = true, children,
}) {
  function go(delta) {
    if (unit === 'year') { onChange(year + delta); return }
    const [y, m] = stepMonth(year, month, delta)
    onChange(y, m)
  }
  function goToday() {
    const now = new Date()
    if (unit === 'year') { onChange(now.getFullYear()); return }
    onChange(now.getFullYear(), now.getMonth() + 1)
  }

  const label = unit === 'year' ? String(year) : `${monthsForYear(year)[month - 1].label} ${year}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={!canGoPrev}
        className="btn-secondary h-[30px] w-[30px] p-0 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={unit === 'year' ? 'Previous year' : 'Previous month'}
      >
        ←
      </button>
      <span className="font-display text-base font-semibold text-ink">{label}</span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={!canGoNext}
        className="btn-secondary h-[30px] w-[30px] p-0 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={unit === 'year' ? 'Next year' : 'Next month'}
      >
        →
      </button>
      {showToday && (
        <button type="button" onClick={goToday} className="btn-secondary h-[30px] px-2 text-xs">Today</button>
      )}
      {children}
    </div>
  )
}
