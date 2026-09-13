import DateStepper, { StepperShell } from './DateStepper'
import { TodayIcon } from './PlannerIcons'
import { addDays, formatShortDateRange, todayStr } from '../lib/dateRange'
import { weekStart } from '../lib/teamLeaveMobile'

// Week: prev/next by 7 days + Today + the current week's range label. Month:
// delegates to the shared DateStepper (prev/next + Today + jump-to-month
// sheet). A small local week stepper rather than a `unit="week"` on the shared
// DateStepper, whose label/jump logic is month-specific — but it borrows that
// component's StepperShell, so the two chevrons and the range sit inside one
// bordered control like every other period picker in the app, rather than as
// two loose square buttons flanking a bare label.
export default function TeamLeaveDateNavigator({ view, weekAnchor, onWeekChange, year, month, onMonthChange }) {
  if (view === 'month') {
    return <DateStepper unit="month" year={year} month={month} onChange={onMonthChange} />
  }

  const start = weekStart(weekAnchor)
  const end = addDays(start, 6)
  const label = `${formatShortDateRange(start, end)} ${start.slice(0, 4)}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StepperShell
        label={label}
        onPrev={() => onWeekChange(addDays(weekAnchor, -7))}
        onNext={() => onWeekChange(addDays(weekAnchor, 7))}
        prevLabel="Previous week"
        nextLabel="Next week"
      />
      <button type="button" onClick={() => onWeekChange(todayStr())} aria-label="Today" title="Today" className="btn-secondary h-[30px] w-[30px] flex-shrink-0 p-0"><TodayIcon className="h-4 w-4" /></button>
    </div>
  )
}
