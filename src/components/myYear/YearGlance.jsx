import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { MONTH_ABBR, todayStr } from '../../lib/dateRange'
import { leaveGroupInk, LEAVE_GROUP_OPTIONS } from '../../lib/leaveMatrix'
import { LEAVE_TYPE_LABELS } from '../../lib/leaveRequests'
import { yearWeekColumns, daysByMonth } from '../../lib/myYear'
import { plannerMonthLink } from '../../lib/myYearLinks'
import LeaveTypeIcon from '../LeaveTypeIcon'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

// "18 Nov: Sick leave" — the square's title and accessible name, so the
// colour is never the only thing saying what a day is.
function dayLabel(day, { showLate = false } = {}) {
  const [, m, d] = day.date.split('-').map(Number)
  const parts = []
  if (day.leave) parts.push(LEAVE_TYPE_LABELS[day.leave.leave_type] || 'Leave')
  if (day.holidayName) parts.push(day.holidayName)
  if (day.onCall) parts.push('On call')
  if (showLate && day.late) parts.push('Late arrival')
  return `${d} ${MONTH_ABBR[m - 1]}${parts.length ? `: ${parts.join(', ')}` : ''}`
}

// Leave takes its group's colour (--leave-ink-*, so it follows the theme);
// a weekend is a shade darker than a weekday either way.
function squareStyle(day, isToday = false) {
  // Today: solid accent, whatever the day holds (the panel under the grid
  // says what that is), so it stands out from every leave colour.
  if (isToday) return { backgroundColor: 'rgb(var(--color-accent))' }
  if (day.leaveGroup) {
    const ink = leaveGroupInk(day.leaveGroup)
    return { backgroundColor: day.weekend ? ink : `color-mix(in srgb, ${ink} 62%, transparent)` }
  }
  return { backgroundColor: `rgb(var(--color-ink) / ${day.weekend ? 0.16 : 0.07})` }
}

function Square({ day, showLate, selected, onSelect, interactive }) {
  const isToday = day.date === todayStr()
  const label = `${dayLabel(day, { showLate })}${isToday ? ' (today)' : ''}`
  // Today wears an accent ring as well as the fill; a selected day that is
  // not today, an ink ring.
  const ring = isToday
    ? 'ring-2 ring-accent ring-offset-1 ring-offset-canvas-raised'
    : selected ? 'ring-2 ring-ink ring-offset-1 ring-offset-canvas-raised' : ''
  const className = `relative block aspect-square w-full rounded-[3px] ${day.holidayName ? 'outline outline-1 -outline-offset-1 outline-ink' : ''} ${ring}`
  const dot = showLate && day.late && (
    <span aria-hidden="true" data-testid="late-dot" className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-ink ring-1 ring-canvas-raised" />
  )
  if (!interactive) {
    return <span role="img" aria-label={label} title={label} data-date={day.date} data-today={isToday || undefined} className={className} style={squareStyle(day, isToday)}>{dot}</span>
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      data-date={day.date}
      onClick={() => onSelect(day.date)}
      data-today={isToday || undefined}
      className={`${className} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent`}
      style={squareStyle(day, isToday)}
    >
      {dot}
    </button>
  )
}

function Legend({ days, showLate }) {
  const groups = LEAVE_GROUP_OPTIONS.filter(g => days.some(d => d.leaveGroup === g.key))
  const sample = 'inline-block h-3 w-3 rounded-[3px]'
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`${sample} ring-2 ring-accent ring-offset-1 ring-offset-canvas-raised`} style={{ backgroundColor: 'rgb(var(--color-accent))' }} />Today
      </li>
      {groups.map(g => (
        <li key={g.key} className="flex items-center gap-1.5"><LeaveTypeIcon groupKey={g.key} size="sm" />{g.label}</li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={sample} style={{ backgroundColor: 'rgb(var(--color-ink) / 0.07)' }} />Weekday
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={sample} style={{ backgroundColor: 'rgb(var(--color-ink) / 0.16)' }} />Weekend (a shade darker)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`${sample} outline outline-1 -outline-offset-1 outline-ink`} />Public holiday
      </li>
      {showLate && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ink" />Late arrival
        </li>
      )}
    </ul>
  )
}

// Desktop: one square per day, weeks as columns, rows Monday to Sunday.
// Phone: one row per month, 31 squares across; a row opens that month in
// the planner (a square there is too small to be a touch target).
export default function YearGlance({ days, year, selectedDate, onSelect, showLate = false }) {
  const isDesktop = useIsDesktop(768)

  if (!isDesktop) {
    const months = daysByMonth(days)
    return (
      <div data-testid="year-glance-months">
        <ul className="divide-y divide-slate-line">
          {months.map((monthDays, i) => {
            const leaveDays = monthDays.filter(d => d.leave)
            const special = leaveDays.length > 0 && !leaveDays.some(d => d.leave.leave_type === 'annual')
            const summary = leaveDays.length === 0 ? 'no leave' : `${leaveDays.length} day${leaveDays.length === 1 ? '' : 's'} on leave`
            return (
              <li key={i}>
                <Link
                  to={plannerMonthLink(year, i + 1, { special })}
                  aria-label={`${MONTH_NAMES[i]}: ${summary}. Open in the ${special ? 'Special' : 'Annual'} planner`}
                  className="flex min-h-[44px] items-center gap-2 py-1.5 active:bg-canvas-sunken"
                >
                  <span className="w-8 flex-shrink-0 text-xs font-semibold text-ink">{MONTH_ABBR[i]}</span>
                  <span className="grid min-w-0 flex-1 gap-[2px]" style={{ gridTemplateColumns: 'repeat(31, minmax(0, 1fr))' }}>
                    {monthDays.map(day => <Square key={day.date} day={day} showLate={showLate} />)}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
        <Legend days={days} showLate={showLate} />
      </div>
    )
  }

  const columns = yearWeekColumns(days)
  const template = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }
  return (
    <div data-testid="year-glance-weeks">
      <div className="flex gap-2">
        <div className="flex w-7 flex-shrink-0 flex-col pt-5 text-[10px] leading-none text-ink-muted" aria-hidden="true">
          <div className="grid flex-1 grid-rows-7 gap-[3px]">
            {ROW_LABELS.map((l, i) => <span key={i} className="flex items-center">{l}</span>)}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 grid h-4 gap-[3px] text-[10px] font-medium leading-none text-ink-muted" style={template} aria-hidden="true">
            {columns.map((column, i) => {
              const first = column.find(d => d && d.date.endsWith('-01'))
              return <span key={i} className="overflow-visible whitespace-nowrap">{first ? MONTH_ABBR[Number(first.date.slice(5, 7)) - 1] : ''}</span>
            })}
          </div>
          <div className="grid gap-[3px]" style={template}>
            {columns.map((column, i) => (
              <div key={i} className="grid grid-rows-7 gap-[3px]">
                {column.map((day, row) => day
                  ? <Square key={day.date} day={day} showLate={showLate} selected={day.date === selectedDate} onSelect={onSelect} interactive />
                  : <span key={`pad-${row}`} className="block aspect-square w-full" aria-hidden="true" />)}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Legend days={days} showLate={showLate} />
    </div>
  )
}
