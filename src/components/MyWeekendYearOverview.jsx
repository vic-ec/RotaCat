import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { monthsForYear } from '../lib/leaveYearGrid'
import { todayStr, parseLocalDate } from '../lib/dateRange'
import { saturdaysInMonth, isProfileAssignedToWeekend, weekendExceptionRequestsBySaturday } from '../lib/weekendPlanner'
import DateStepper from './DateStepper'
import { TodayIcon } from './PlannerIcons'

// A genuinely different read of the same weekend_planner_entries +
// weekend_exception leave_requests data WeekendYearOverview.jsx uses — this
// is "am I on this weekend" (working/off/pending exception) for the
// signed-in doctor, not staffing completeness, so it's kept local to this
// component rather than shared with weekendYearOverview.js's admin-facing
// helpers.
function monthPersonalMarkers(year, month, byWeekend, profileId, requestsBySaturday) {
  return saturdaysInMonth(year, month).map(saturday => {
    const working = isProfileAssignedToWeekend(byWeekend.get(saturday), profileId)
    const pending = !working && requestsBySaturday.has(saturday)
    return { saturday, state: working ? 'working' : pending ? 'pending' : 'off' }
  })
}

// Uses accent (not the flagRed/flagAmber/success roster-state read
// WeekendYearOverview.jsx uses) — "am I working" isn't a staffing-health
// signal, it's the same personal-presence read the rest of the app already
// gives accent. Exception pending stays flagAmber (a genuine roster-state
// flag: this weekend's plan is still unsettled), and off is a neutral
// canvas tone rather than any status colour at all.
const STATE_STYLE = {
  working: { square: 'bg-accent-tint', swatch: 'bg-accent', label: 'Working' },
  pending: { square: 'bg-flagAmber-bg', swatch: 'bg-flagAmber', label: 'Exception pending' },
  off: { square: 'bg-canvas-sunken', swatch: 'bg-canvas-sunken', label: 'Off' },
}

function formatShortDate(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// The Weekend Planner's year-overview landing page for a doctor — same
// shell as WeekendYearOverview.jsx (toolbar, legend, 3x4 month grid, sticky
// inspector, tap-a-month → "Open month" flow) but reading "am I on this
// weekend" instead of staffing completeness, and with no admin-only stats.
export default function MyWeekendYearOverview({ year, onYearChange, byWeekend, myRequests, myProfileId, onOpenMonth }) {
  const today = todayStr()
  const todayYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(todayYear === year ? currentMonth : 1)
  const requestsBySaturday = weekendExceptionRequestsBySaturday(myRequests)

  const months = monthsForYear(year)
  const monthCards = months.map(m => ({ ...m, markers: monthPersonalMarkers(m.year, m.month, byWeekend, myProfileId, requestsBySaturday) }))

  const selectedMarkers = monthCards[selectedMonth - 1].markers
  const workingCount = selectedMarkers.filter(m => m.state === 'working').length
  const pendingCount = selectedMarkers.filter(m => m.state === 'pending').length

  // The page's own Today, not DateStepper's own built-in one (suppressed
  // below via showToday={false}) — resets both the browsed year AND the
  // selected month back to today's real ones, since DateStepper's version
  // only ever knows about the year prop it's bound to.
  function goToToday() {
    if (year !== todayYear) onYearChange(todayYear)
    setSelectedMonth(currentMonth)
  }
  const isOnToday = year === todayYear && selectedMonth === currentMonth

  // Selected-month chevrons/jump-sheet: DateStepper itself handles the
  // Dec/Jan year rollover, calling back with whichever year the stepped-to
  // month landed in — only forward that to onYearChange when it's actually
  // different from the year this page is already browsing.
  function handleSelectedMonthChange(y, m) {
    if (y !== year) onYearChange(y)
    setSelectedMonth(m)
  }

  return (
    <div>
      {/* ── Toolbar: year selector, then this page's own Today, then Legend,
          all in one cluster on the right. ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">My weekends</h2>
        <div className="flex flex-wrap items-center gap-2">
          <DateStepper unit="year" year={year} onChange={onYearChange} showToday={false} />
          {!isOnToday && (
            <button type="button" onClick={goToToday} aria-label="Today" title="Today" className="btn-secondary h-[30px] w-[30px] p-0"><TodayIcon className="h-4 w-4" /></button>
          )}
          <div data-testid="weekend-year-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {Object.values(STATE_STYLE).map(state => (
              <span key={state.label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${state.swatch}`} /> {state.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main workspace: 3x4 month grid + sticky inspector ── */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 lg:grid-cols-3">
          {monthCards.map(m => (
            <MyWeekendMonthCard
              key={m.month}
              month={m}
              isSelected={m.month === selectedMonth}
              onSelect={() => m.month === selectedMonth ? onOpenMonth(m.month) : setSelectedMonth(m.month)}
            />
          ))}
        </div>

        <div
          data-testid="my-weekend-year-inspector"
          className="order-first w-full flex-shrink-0 rounded-lg border border-slate-line bg-canvas-raised p-4 lg:order-none lg:sticky lg:top-4 lg:w-72"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected month</p>
          <div className="mt-1">
            <DateStepper unit="month" year={year} month={selectedMonth} onChange={handleSelectedMonthChange} showToday={false} centered />
          </div>

          <div className="mt-3 space-y-2 border-t border-slate-line pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Working</span>
              <span className="font-medium text-accent">{workingCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Exception pending</span>
              <span className="font-medium text-flagAmber">{pendingCount}</span>
            </div>
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

function MyWeekendMonthCard({ month, isSelected, onSelect }) {
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
          const style = STATE_STYLE[m.state]
          return (
            <span key={m.saturday} className="h-8 w-8 lg:h-9 lg:w-12" title={`${formatShortDate(m.saturday)} — ${style.label}`}>
              <span className={`block h-8 w-8 rounded-md lg:h-9 lg:w-12 ${style.square}`} />
            </span>
          )
        })}
      </div>
    </button>
  )
}
