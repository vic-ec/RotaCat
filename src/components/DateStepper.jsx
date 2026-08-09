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
// `unit="month"`'s label is itself a button opening a jump-to-month sheet
// (year stepper + 12-month grid) — stepping one month at a time to get
// somewhere several months away is exactly the kind of thing a shared
// stepper should solve once. `unit="year"` has no equivalent list to jump
// through, so its label stays a plain, non-interactive span.
export default function DateStepper({
  unit, year, month, onChange, showToday = true, canGoPrev = true, canGoNext = true, children,
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
      {unit === 'month' ? (
        <button
          type="button"
          onClick={() => setJumpOpen(true)}
          className="font-display text-base font-semibold text-ink hover:text-accent"
        >
          {label}
        </button>
      ) : (
        <span className="font-display text-base font-semibold text-ink">{label}</span>
      )}
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
      {jumpOpen && (
        <MonthJumpSheet
          year={year}
          month={month}
          onPick={(y, m) => { onChange(y, m); setJumpOpen(false) }}
          onClose={() => setJumpOpen(false)}
        />
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
