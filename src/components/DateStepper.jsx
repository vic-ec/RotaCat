import { useState } from 'react'
import { monthsForYear } from '../lib/leaveYearGrid'
import { ActionSheet } from './ActionSheet'

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

  // Today only means anything once you've actually navigated away from it —
  // showing it while already looking at the current period is a reset
  // button with nothing to reset. `showToday` (caller-controlled) decides
  // whether Today is offered at all here; this decides whether it's visible
  // right now, once it is. Faded rather than unmounted so the transition is
  // an actual fade-in, not a layout-shifting pop.
  const now = new Date()
  const isCurrentPeriod = unit === 'year'
    ? year === now.getFullYear()
    : year === now.getFullYear() && month === now.getMonth() + 1

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
          tabIndex={isCurrentPeriod ? -1 : 0}
          aria-hidden={isCurrentPeriod || undefined}
          className={`btn-secondary h-[30px] px-2 text-xs transition-opacity duration-200 ${
            isCurrentPeriod ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          Today
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

// Jump-to-month sheet body: a year stepper up top, a 12-month grid below.
// Tapping a month jumps straight there and closes — no separate "confirm"
// step, same as every other one-tap sheet in the app.
function MonthJumpSheet({ year, month, onPick, onClose }) {
  const [jumpYear, setJumpYear] = useState(year)
  const months = monthsForYear(jumpYear)

  return (
    <ActionSheet title="Jump to month" onClose={onClose}>
      <div className="flex items-center justify-center gap-2 py-3">
        <button type="button" onClick={() => setJumpYear(y => y - 1)} className="btn-secondary h-[30px] w-[30px] p-0 text-sm" aria-label="Previous year">←</button>
        <span className="font-display text-base font-semibold text-ink">{jumpYear}</span>
        <button type="button" onClick={() => setJumpYear(y => y + 1)} className="btn-secondary h-[30px] w-[30px] p-0 text-sm" aria-label="Next year">→</button>
      </div>
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
    </ActionSheet>
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

function YearJumpSheet({ year, onPick, onClose }) {
  const [rangeStart, setRangeStart] = useState(() => yearsRangeStart(year))
  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => rangeStart + i)

  return (
    <ActionSheet title="Jump to year" onClose={onClose}>
      <div className="flex items-center justify-center gap-2 py-3">
        <button type="button" onClick={() => setRangeStart(r => r - YEARS_PER_PAGE)} className="btn-secondary h-[30px] w-[30px] p-0 text-sm" aria-label="Previous years">←</button>
        <span className="font-display text-base font-semibold text-ink">{rangeStart}–{rangeStart + YEARS_PER_PAGE - 1}</span>
        <button type="button" onClick={() => setRangeStart(r => r + YEARS_PER_PAGE)} className="btn-secondary h-[30px] w-[30px] p-0 text-sm" aria-label="Next years">→</button>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
        {years.map(y => {
          const isCurrent = y === year
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
    </ActionSheet>
  )
}
