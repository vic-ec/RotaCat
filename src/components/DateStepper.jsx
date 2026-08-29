import { useState } from 'react'
import { monthsForYear } from '../lib/leaveYearGrid'
import { ActionSheet } from './ActionSheet'
import { TodayIcon } from './PlannerIcons'

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
// enabled — no current caller has a real edge to disable at (WeekendPlannerView
// used to, before its own fetch window learned to follow navigation instead
// of gating it), but a future one might, so the capability stays available
// rather than assuming every caller can browse freely forever.
//
// Page-specific extras (a "← Back" link, a Legend toggle, a rule-hint icon)
// are deliberately NOT part of this component's API — pass them as
// `children`, rendered in the same row after the Today button, rather than
// baking page context into a shared control.
//
// The label is itself a button opening a jump sheet — `unit="month"` gets a
// year stepper + 12-month grid, `unit="year"` gets a range stepper + 12-year
// grid — stepping one period at a time to get somewhere several away is
// exactly the kind of thing a shared stepper should solve once, for both
// units alike.
//
// `centered`: opt-in, off by default — flanks the label with `flex-1
// text-center` instead of the default left-flowing row, so the chevrons
// sit at equal distance from the label on both sides. For a standalone
// "selected period" display (e.g. an inspector panel's own month/year
// heading) rather than a toolbar row sharing space with other controls.
export default function DateStepper({
  unit, year, month, onChange, showToday = true, canGoPrev = true, canGoNext = true, children, centered = false,
}) {
  const [jumpOpen, setJumpOpen] = useState(false)

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

  // Today is permanently visible wherever `showToday` offers it at all. It
  // used to fade out while you were already looking at the current period,
  // on the reasoning that a reset button with nothing to reset is noise —
  // but a control that comes and goes is harder to reach for than one
  // that's simply always there, and a half-faded button reads as broken
  // rather than as "not needed right now". Pressing it while already on the
  // current period is a harmless no-op.

  return (
    <div className={`flex flex-wrap items-center gap-2 ${centered ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={!canGoPrev}
        className="btn-secondary h-[30px] w-[30px] flex-shrink-0 p-0 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={unit === 'year' ? 'Previous year' : 'Previous month'}
      >
        ←
      </button>
      <button
        type="button"
        onClick={() => setJumpOpen(true)}
        className={`font-display text-base font-semibold text-ink hover:text-accent ${centered ? 'flex-1 text-center' : ''}`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={!canGoNext}
        className="btn-secondary h-[30px] w-[30px] flex-shrink-0 p-0 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={unit === 'year' ? 'Next year' : 'Next month'}
      >
        →
      </button>
      {showToday && (
        <button
          type="button"
          onClick={goToday}
          aria-label="Today"
          title="Today"
          className="btn-secondary h-[30px] w-[30px] flex-shrink-0 p-0"
        >
          <TodayIcon className="h-4 w-4" />
        </button>
      )}
      {children}
      {jumpOpen && (
        unit === 'month' ? (
          <MonthJumpSheet
            year={year}
            month={month}
            onPick={(y, m) => { onChange(y, m); setJumpOpen(false) }}
            onClose={() => setJumpOpen(false)}
          />
        ) : (
          <YearJumpSheet
            year={year}
            onPick={y => { onChange(y); setJumpOpen(false) }}
            onClose={() => setJumpOpen(false)}
          />
        )
      )}
    </div>
  )
}

// Years don't have a natural enclosing "page" the way months have their
// year — a 12-year range (same grid shape as the month sheet, just years
// instead of month names) is the closest equivalent, stepped a whole range
// at a time rather than one year at a time.
const YEARS_PER_PAGE = 12
function yearsRangeStart(year) {
  return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE
}

// The 12-button year grid, shared by YearJumpSheet's own sheet and
// MonthJumpSheet's embedded "swap to years" view below — same tap-to-pick
// styling either way.
function YearGridButtons({ rangeStart, currentYear, onPick }) {
  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => rangeStart + i)
  return (
    <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
      {years.map(y => {
        const isCurrent = y === currentYear
        return (
          <button
            key={y}
            type="button"
            onClick={() => onPick(y)}
            aria-current={isCurrent ? 'true' : undefined}
            className={`rounded-md px-2 py-2 text-sm font-medium transition-colors ${
              isCurrent ? 'bg-accent text-white' : 'bg-canvas-sunken text-ink hover:bg-accent-tint'
            }`}
          >
            {y}
          </button>
        )
      })}
    </div>
  )
}

// Jump-to-month sheet body: a year stepper up top, a 12-month grid below.
// Tapping a month jumps straight there and closes — no separate "confirm"
// step, same as every other one-tap sheet in the app. Tapping the year
// label itself swaps the body to a 12-year grid (reusing YearGridButtons)
// instead of stepping one year at a time — picking a year there lands back
// on the month grid for it, rather than closing the sheet, since a year
// alone was never a valid pick here. The sheet's own title/accessible name
// switches to "Jump to year" for that swapped-in view and back to "Jump to
// month" once a year's picked, so it always names whichever grid is
// actually showing — callers that open it via the month label should
// re-query the dialog by name after swapping views.
function MonthJumpSheet({ year, month, onPick, onClose }) {
  const [jumpYear, setJumpYear] = useState(year)
  const [showYears, setShowYears] = useState(false)
  const [yearRangeStart, setYearRangeStart] = useState(() => yearsRangeStart(year))
  const months = monthsForYear(jumpYear)

  function pickYear(y) {
    setJumpYear(y)
    setYearRangeStart(yearsRangeStart(y))
    setShowYears(false)
  }

  return (
    <ActionSheet title={showYears ? 'Jump to year' : 'Jump to month'} onClose={onClose}>
      <div className="flex items-center justify-center gap-2 py-3">
        <button
          type="button"
          onClick={() => showYears ? setYearRangeStart(r => r - YEARS_PER_PAGE) : setJumpYear(y => y - 1)}
          className="btn-secondary h-[30px] w-[30px] p-0 text-sm"
          aria-label={showYears ? 'Previous years' : 'Previous year'}
        >←</button>
        <button
          type="button"
          onClick={() => setShowYears(v => !v)}
          className="font-display text-base font-semibold text-ink hover:text-accent"
        >
          {showYears ? `${yearRangeStart}–${yearRangeStart + YEARS_PER_PAGE - 1}` : jumpYear}
        </button>
        <button
          type="button"
          onClick={() => showYears ? setYearRangeStart(r => r + YEARS_PER_PAGE) : setJumpYear(y => y + 1)}
          className="btn-secondary h-[30px] w-[30px] p-0 text-sm"
          aria-label={showYears ? 'Next years' : 'Next year'}
        >→</button>
      </div>
      {showYears ? (
        <YearGridButtons rangeStart={yearRangeStart} currentYear={jumpYear} onPick={pickYear} />
      ) : (
        <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
          {months.map(m => {
            const isCurrent = jumpYear === year && m.month === month
            return (
              <button
                key={m.month}
                type="button"
                onClick={() => onPick(jumpYear, m.month)}
                aria-current={isCurrent ? 'true' : undefined}
                className={`rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                  isCurrent ? 'bg-accent text-white' : 'bg-canvas-sunken text-ink hover:bg-accent-tint'
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      )}
    </ActionSheet>
  )
}

function YearJumpSheet({ year, onPick, onClose }) {
  const [rangeStart, setRangeStart] = useState(() => yearsRangeStart(year))

  return (
    <ActionSheet title="Jump to year" onClose={onClose}>
      <div className="flex items-center justify-center gap-2 py-3">
        <button type="button" onClick={() => setRangeStart(r => r - YEARS_PER_PAGE)} className="btn-secondary h-[30px] w-[30px] p-0 text-sm" aria-label="Previous years">←</button>
        <span className="font-display text-base font-semibold text-ink">{rangeStart}–{rangeStart + YEARS_PER_PAGE - 1}</span>
        <button type="button" onClick={() => setRangeStart(r => r + YEARS_PER_PAGE)} className="btn-secondary h-[30px] w-[30px] p-0 text-sm" aria-label="Next years">→</button>
      </div>
      <YearGridButtons rangeStart={rangeStart} currentYear={year} onPick={onPick} />
    </ActionSheet>
  )
}
