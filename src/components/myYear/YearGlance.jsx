import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { MONTH_ABBR, todayStr } from '../../lib/dateRange'
import { leaveGroupInk, LEAVE_GROUP_OPTIONS } from '../../lib/leaveMatrix'
import { LEAVE_TYPE_LABELS, SPECIAL_LEAVE_TYPES } from '../../lib/leaveRequests'
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

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// A month opened on a phone: a Monday-first calendar with cells big enough
// to tap (about 44px), each day in the grid's own colours, its number on it.
function MonthCalendar({ year, monthIndex, monthDays, selectedDate, onSelect, showLate }) {
  // The Special planner only when the month's leave is special leave (it
  // doesn't show sick leave); the Annual planner otherwise.
  const leaveDays = monthDays.filter(d => d.leave)
  const special = leaveDays.some(d => SPECIAL_LEAVE_TYPES.includes(d.leave.leave_type)) && !leaveDays.some(d => d.leave.leave_type === 'annual')
  const lead = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const today = todayStr()
  return (
    <div className="pb-3 pt-1" data-testid="month-calendar">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{MONTH_NAMES[monthIndex]} {year}</span>
        <Link to={plannerMonthLink(year, monthIndex + 1, { special })} className="text-sm font-medium text-accent hover:text-accent-dark">
          {special ? 'Special' : 'Annual'} planner ›
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-ink-muted" aria-hidden="true">
        {DOW.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} aria-hidden="true" />)}
        {monthDays.map(day => {
          const isToday = day.date === today
          const selected = day.date === selectedDate
          const label = `${dayLabel(day, { showLate })}${isToday ? ' (today)' : ''}`
          return (
            <button
              key={day.date}
              type="button"
              aria-label={label}
              aria-pressed={selected}
              data-date={day.date}
              onClick={() => onSelect(day.date)}
              style={squareStyle(day, isToday)}
              className={`relative flex aspect-square items-center justify-center rounded-md text-xs ${isToday ? 'font-bold text-on-fill' : 'text-ink'} ${
                day.holidayName ? 'outline outline-1 -outline-offset-1 outline-ink' : ''
              } ${selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-canvas-raised' : ''}`}
            >
              {Number(day.date.slice(8, 10))}
              {showLate && day.late && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ink" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Desktop: one square per day, weeks as columns, rows Monday to Sunday.
// Phone: one row per month, 31 squares across (too small to tap one); a
// tap on a row opens that month in place as a calendar to pick a day from,
// with the planner a link in its header. One month open at a time; it
// starts on the selected day's month.
// `openOn`: the date whose month starts open on a phone (today), else the
// selected day's.
// The current month's name is in the accent, as on the Rotations table.
export default function YearGlance({ days, year, selectedDate, onSelect, showLate = false, openOn = null }) {
  const isDesktop = useIsDesktop(768)
  const today = todayStr()
  const currentMonth = today.startsWith(`${year}-`) ? Number(today.slice(5, 7)) - 1 : null
  const startDate = openOn || selectedDate
  const startMonth = startDate && startDate.startsWith(`${year}-`) ? Number(startDate.slice(5, 7)) - 1 : null
  const [openMonth, setOpenMonth] = useState(startMonth)

  if (!isDesktop) {
    const months = daysByMonth(days)
    return (
      <div data-testid="year-glance-months">
        <ul className="divide-y divide-slate-line">
          {months.map((monthDays, i) => {
            const leaveDays = monthDays.filter(d => d.leave)
            const summary = leaveDays.length === 0 ? 'no leave' : `${leaveDays.length} day${leaveDays.length === 1 ? '' : 's'} on leave`
            const open = openMonth === i
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setOpenMonth(open ? null : i)}
                  aria-expanded={open}
                  aria-label={`${MONTH_NAMES[i]}: ${summary}. ${open ? 'Close' : 'Open'} the month to pick a day`}
                  className={`-mx-2 flex min-h-[44px] w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left active:bg-canvas-sunken ${open ? 'bg-accent-tint' : ''}`}
                >
                  <span className={`w-8 flex-shrink-0 text-xs ${i === currentMonth ? 'font-bold text-accent' : 'font-semibold text-ink'}`} data-current-month={i === currentMonth || undefined}>{MONTH_ABBR[i]}</span>
                  <span className="grid min-w-0 flex-1 gap-[2px]" style={{ gridTemplateColumns: 'repeat(31, minmax(0, 1fr))' }}>
                    {monthDays.map(day => <Square key={day.date} day={day} showLate={showLate} selected={day.date === selectedDate} />)}
                  </span>
                  <ChevronDown className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {open && (
                  <MonthCalendar year={year} monthIndex={i} monthDays={monthDays} selectedDate={selectedDate} onSelect={onSelect} showLate={showLate} />
                )}
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
              const m = first ? Number(first.date.slice(5, 7)) - 1 : null
              return <span key={i} className={`overflow-visible whitespace-nowrap ${m !== null && m === currentMonth ? 'font-bold text-accent' : ''}`} data-current-month={(m !== null && m === currentMonth) || undefined}>{m !== null ? MONTH_ABBR[m] : ''}</span>
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
