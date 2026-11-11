import SlotPips from './SlotPips'
import { weeksForMonthMondayFirst, isWeekendDate, WEEKDAY_NAMES_MONDAY_FIRST, WEEKDAY_SHORT_MONDAY_FIRST } from '../lib/plannerCalendar'

// The one month calendar the Annual and Special planners share. Monday
// first, weekend columns shaded, public holidays outlined with their name,
// today marked on its number, the selected day outlined and tinted in the
// accent, and SlotPips on EVERY day — a day with nobody out shows three
// empty green-outlined pips, so "free" is a signal, not an absence.
//
// `cells` is a Map<date, { used, isPublicHoliday, phName, names }>, where
// `names` is [{ key, label, badge, pending }] — the people to list on a
// desktop cell (at most three, then "+N more"; badge is the category
// abbreviation). A date with no entry in the map is a free day.
//
// Desktop (lg+): full weekday names, the taller 104px row, names in the
// cell. Below lg: two-letter weekday names and a 44px-minimum tap target
// holding just the number and the pips — names are read in the details
// sheet a tap opens. Every cell is a real <button>, reachable from the
// keyboard with a visible focus ring.
export default function PlannerCalendarGrid({
  year, month, cells = new Map(), selectedDate, today, onSelect, max = 3, pipLabel, className = '',
}) {
  const weeks = weeksForMonthMondayFirst(year, month)

  function cellClass(date, base) {
    const cell = cells.get(date)
    const selected = date === selectedDate
    return [
      base,
      'relative text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      isWeekendDate(date) ? 'bg-dateWeekend-tint' : 'bg-canvas-raised',
      selected ? 'z-[1] bg-accent-tint ring-2 ring-inset ring-accent' : cell?.isPublicHoliday ? 'ring-2 ring-inset ring-ink' : '',
      selected ? '' : 'hover:bg-canvas-sunken',
    ].join(' ')
  }

  function dayNumber(date) {
    const isToday = date === today
    return (
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-accent text-on-fill' : 'text-ink'}`}>
        {Number(date.slice(-2))}
      </span>
    )
  }

  return (
    <div data-testid="planner-calendar-grid" className={className}>
      {/* ── Desktop ── */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-line lg:block">
        <div className="grid grid-cols-7 border-b border-slate-line bg-canvas-sunken">
          {WEEKDAY_NAMES_MONDAY_FIRST.map(d => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-ink-muted">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((date, i) => {
            if (!date) return <div key={`blank-${i}`} className="min-h-[104px] border-b border-r border-slate-line bg-canvas-sunken/30" />
            const cell = cells.get(date)
            const names = cell?.names ?? []
            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelect(date)}
                aria-pressed={date === selectedDate}
                aria-label={`${date}${cell?.phName ? `, ${cell.phName}` : ''}`}
                className={cellClass(date, 'flex min-h-[104px] flex-col items-stretch gap-1 border-b border-r border-slate-line p-2')}
              >
                <div className="flex items-center justify-between gap-1">
                  {dayNumber(date)}
                  <SlotPips used={cell?.used ?? 0} max={max} label={pipLabel?.(cell?.used ?? 0)} />
                </div>
                {cell?.phName && <span className="truncate text-[10px] font-medium text-ink-muted">{cell.phName}</span>}
                <div className="flex-1 space-y-0.5 overflow-hidden">
                  {names.slice(0, 3).map(n => (
                    <div key={n.key} className={`flex items-center gap-1 text-[11px] leading-tight ${n.pending ? 'italic text-ink-muted' : 'text-ink'}`}>
                      {n.badge && <span className="w-6 flex-shrink-0 text-[10px] font-semibold uppercase text-ink-muted">{n.badge}</span>}
                      <span className="truncate">{n.label}</span>
                    </div>
                  ))}
                  {names.length > 3 && <div className="text-[10px] text-ink-muted">+{names.length - 3} more</div>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Mobile ── */}
      <div className="lg:hidden">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-muted">
          {WEEKDAY_SHORT_MONDAY_FIRST.map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {weeks.flat().map((date, i) => {
            if (!date) return <div key={`blank-${i}`} />
            const cell = cells.get(date)
            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelect(date)}
                aria-pressed={date === selectedDate}
                aria-label={`${date}${cell?.phName ? `, ${cell.phName}` : ''}`}
                className={cellClass(date, 'flex min-h-[44px] flex-col items-start gap-1 rounded-md border border-slate-line p-1')}
              >
                {dayNumber(date)}
                <SlotPips used={cell?.used ?? 0} max={max} label={pipLabel?.(cell?.used ?? 0)} className="pl-0.5" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
