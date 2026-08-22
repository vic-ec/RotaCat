import DateStepper from './DateStepper'
import { TodayIcon } from './PlannerIcons'
import { addDays, formatShortDateRange, todayStr } from '../lib/dateRange'
import { weekStart } from '../lib/teamLeaveMobile'

// Week: prev/next by 7 days + Today + the current week's range label. Month:
// delegates to the shared DateStepper (prev/next + Today + jump-to-month
// sheet). A small local week stepper rather than a `unit="week"` on the shared
// DateStepper, whose label/jump logic is month-specific.
export default function TeamLeaveDateNavigator({ view, weekAnchor, onWeekChange, year, month, onMonthChange }) {
  if (view === 'month') {
    return <DateStepper unit="month" year={year} month={month} onChange={onMonthChange} />
  }

  const start = weekStart(weekAnchor)
  const end = addDays(start, 6)
  const label = `${formatShortDateRange(start, end)} ${start.slice(0, 4)}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onWeekChange(addDays(weekAnchor, -7))} aria-label="Previous week" className="btn-secondary h-[30px] w-[30px] p-0 text-sm">←</button>
      <span className="font-display text-base font-semibold text-ink">{label}</span>
      <button type="button" onClick={() => onWeekChange(addDays(weekAnchor, 7))} aria-label="Next week" className="btn-secondary h-[30px] w-[30px] p-0 text-sm">→</button>
      <button type="button" onClick={() => onWeekChange(todayStr())} aria-label="Today" title="Today" className="btn-secondary h-[30px] w-[30px] p-0"><TodayIcon className="h-4 w-4" /></button>
    </div>
  )
}
