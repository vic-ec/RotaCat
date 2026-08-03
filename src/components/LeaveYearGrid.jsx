import { useMemo, useState } from 'react'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, COLUMN_DOT_COLOR, columnForLeaveCategory,
  quartersForYear, datesInMonth, weeksForMonth, monthsForYear,
} from '../lib/leaveYearGrid'
import { dayOfWeek, todayStr } from '../lib/dateRange'
import { annualDaysSummary } from '../lib/leaveRequests'
import { useAuth } from '../context/AuthContext'

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const GRID_COLUMNS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

// Shared leave-planner grid for the Annual Leave and Special Leave tabs.
// Desktop (lg+) gets the full year-at-a-glance spreadsheet-style layout (4
// quarters of 3 months, every column visible). Mobile gets a month-at-a-time
// calendar instead — a full year of narrow day-row tables doesn't fit a
// phone screen usefully — with a tap-for-detail day sheet rather than
// trying to cram every name into a tiny cell. Both share the same
// leaveByDate/publicHolidaysByDate data, just fetched once by the caller.
//
// Callers pre-shape leaveByDate entries as { profileId, surname, category,
// status } and public holidays as a date -> name map. myProfileId (optional)
// enables the "My leave / All" filter; maxByColumnKey (optional) shows
// "(max N)" capacity hints — pass it for Annual Leave, omit for Special
// Leave (no concurrency cap there).
export default function LeaveYearGrid({ year, onYearChange, leaveByDate, publicHolidaysByDate, maxByColumnKey, myProfileId }) {
  const { isAdmin } = useAuth()
  // Consultant leave is only ever visible to an admin (or another
  // Consultant — see EC_LEAVE_PLANNER_RULES.md's Consultant privacy rule),
  // so a non-admin viewer shouldn't see the category referenced at all —
  // used for both the mobile legend and DayDetailSheet's per-category
  // breakdown (passed down as `visibleColumns`). The desktop table's
  // columns are left as-is (not a "legend" or day view, and already
  // resolve to empty for non-admins via RLS regardless).
  const legendColumns = isAdmin ? GRID_COLUMNS : GRID_COLUMNS.filter(col => col.key !== 'Other')
  const [openPH, setOpenPH] = useState(null) // date string or null, desktop hover/tap tooltip
  const [showMineOnly, setShowMineOnly] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(null)

  const visibleLeaveByDate = useMemo(() => {
    if (!showMineOnly || !myProfileId) return leaveByDate
    const filtered = new Map()
    for (const [date, entries] of leaveByDate) {
      const mine = entries.filter(e => e.profileId === myProfileId)
      if (mine.length) filtered.set(date, mine)
    }
    return filtered
  }, [leaveByDate, showMineOnly, myProfileId])

  function goPrevMonth() {
    if (viewMonth === 1) { onYearChange(year - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }
  function goNextMonth() {
    if (viewMonth === 12) { onYearChange(year + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }
  function goToday() {
    const now = new Date()
    if (now.getFullYear() !== year) onYearChange(now.getFullYear())
    setViewMonth(now.getMonth() + 1)
  }

  return (
    <div className="mt-4">
      {myProfileId && (
        <div className="mb-3 flex justify-center gap-1 rounded-lg border border-slate-line bg-canvas-raised p-0.5 w-fit mx-auto">
          {[{ key: true, label: 'My leave' }, { key: false, label: 'All' }].map(opt => (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => setShowMineOnly(opt.key)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                showMineOnly === opt.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Desktop: full year, 4 quarters of 3 months */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => onYearChange(year - 1)} className="btn-secondary px-2 py-1 text-sm" aria-label="Previous year">←</button>
          <span className="font-display text-lg font-semibold text-ink">{year}</span>
          <button type="button" onClick={() => onYearChange(year + 1)} className="btn-secondary px-2 py-1 text-sm" aria-label="Next year">→</button>
        </div>

        <div className="mt-4 space-y-6">
          {quartersForYear(year).map(quarter => (
            <div key={quarter.index}>
              <p className="label-text">Q{quarter.index}</p>
              <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
                {quarter.months.map(m => (
                  <MonthTable
                    key={`${m.year}-${m.month}`}
                    year={m.year}
                    month={m.month}
                    label={m.label}
                    leaveByDate={visibleLeaveByDate}
                    publicHolidaysByDate={publicHolidaysByDate}
                    maxByColumnKey={maxByColumnKey}
                    openPH={openPH}
                    setOpenPH={setOpenPH}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: one month at a time, tap a day for detail */}
      <div className="lg:hidden">
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={goPrevMonth} className="btn-secondary px-2 py-1 text-sm" aria-label="Previous month">←</button>
          <span className="font-display text-base font-semibold text-ink">{monthsForYear(year)[viewMonth - 1].label} {year}</span>
          <button type="button" onClick={goNextMonth} className="btn-secondary px-2 py-1 text-sm" aria-label="Next month">→</button>
          <button type="button" onClick={goToday} className="btn-secondary px-2 py-1 text-xs">Today</button>
        </div>

        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
          {legendColumns.map(col => (
            <span key={col.key} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${COLUMN_DOT_COLOR[col.key]}`} />
              {col.label}
            </span>
          ))}
        </div>

        <MonthGlance
          year={year}
          month={viewMonth}
          leaveByDate={visibleLeaveByDate}
          publicHolidaysByDate={publicHolidaysByDate}
          onSelectDate={setSelectedDate}
        />
      </div>

      {selectedDate && (
        <DayDetailSheet
          date={selectedDate}
          entries={visibleLeaveByDate.get(selectedDate) || []}
          phName={publicHolidaysByDate.get(selectedDate)}
          maxByColumnKey={maxByColumnKey}
          visibleColumns={legendColumns}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}

function MonthGlance({ year, month, leaveByDate, publicHolidaysByDate, onSelectDate }) {
  const weeks = weeksForMonth(year, month)
  const today = todayStr()

  return (
    <div className="mt-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-muted">
        {WEEKDAY_SHORT.map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />
          const phName = publicHolidaysByDate.get(date)
          const entries = leaveByDate.get(date) || []
          const columnsPresent = [...new Set(entries.map(e => columnForLeaveCategory(e.category)).filter(Boolean))]
          const isToday = date === today

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`flex aspect-square flex-col items-center justify-center rounded border bg-canvas-raised text-xs ${
                phName ? 'border-ink ring-1 ring-inset ring-ink' : 'border-slate-line'
              } ${isToday ? 'ring-1 ring-accent' : ''} hover:bg-canvas-sunken`}
            >
              <span className={`text-ink ${phName ? 'font-semibold' : ''}`}>{Number(date.slice(-2))}</span>
              <span className="mt-0.5 flex h-1.5 gap-0.5">
                {columnsPresent.map(key => (
                  <span key={key} className={`h-1.5 w-1.5 rounded-full ${COLUMN_DOT_COLOR[key]}`} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DayDetailSheet({ date, entries, phName, maxByColumnKey, visibleColumns, onClose }) {
  const byColumn = new Map()
  for (const entry of entries) {
    const key = columnForLeaveCategory(entry.category)
    if (!key) continue
    if (!byColumn.has(key)) byColumn.set(key, [])
    byColumn.get(key).push(entry)
  }
  const dow = dayOfWeek(date)
  const formatted = `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]}, ${date}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">{formatted}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>
        {phName && <p className="mt-1 text-sm font-medium text-accent">{phName}</p>}

        <div className="mt-3 space-y-3">
          {visibleColumns.map(col => {
            const colEntries = byColumn.get(col.key) || []
            const max = maxByColumnKey?.[col.key]
            return (
              <div key={col.key} className="text-sm">
                <div className="flex items-center gap-1.5 text-ink-muted">
                  <span className={`h-2 w-2 rounded-full ${COLUMN_DOT_COLOR[col.key]}`} />
                  {col.label}
                  {max ? <span className="text-xs">({colEntries.length}/{max})</span> : null}
                </div>
                {colEntries.length === 0 ? (
                  <p className="text-ink-muted">—</p>
                ) : (
                  <ul className="mt-0.5 space-y-0.5">
                    {colEntries.map(e => {
                      const summary = annualDaysSummary({
                        leave_type: e.leaveType, date_from: e.dateFrom, date_to: e.dateTo, annual_leave_days: e.annualLeaveDays,
                      })
                      return (
                        <li key={e.profileId} className="flex items-baseline justify-between gap-2">
                          <span className={e.status === 'pending' ? 'italic text-ink-muted' : 'text-ink'}>{e.surname}</span>
                          {summary && <span className="text-xs text-ink-muted">{summary}</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthTable({ year, month, label, leaveByDate, publicHolidaysByDate, maxByColumnKey, openPH, setOpenPH }) {
  const dates = datesInMonth(year, month)

  return (
    <div className="card overflow-hidden p-0">
      <p className="border-b border-slate-line bg-canvas-sunken px-2 py-1 text-xs font-semibold text-ink">{label}</p>
      <table className="w-full table-fixed border-collapse text-[11px]">
        <colgroup>
          <col className="w-8" />
          {GRID_COLUMNS.map(col => <col key={col.key} />)}
        </colgroup>
        <thead>
          <tr className="text-ink-muted">
            <th className="px-1 py-0.5 text-left font-medium"></th>
            {GRID_COLUMNS.map(col => (
              <th key={col.key} className="px-1 py-0.5 text-left font-medium">
                {col.label}
                {maxByColumnKey?.[col.key] ? <span className="block font-normal">max {maxByColumnKey[col.key]}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map(date => {
            const dow = dayOfWeek(date)
            const isWeekend = dow === 0 || dow === 6
            const phName = publicHolidaysByDate.get(date)
            const entries = leaveByDate.get(date) || []
            const byColumn = new Map()
            for (const entry of entries) {
              const key = columnForLeaveCategory(entry.category)
              if (!key) continue
              if (!byColumn.has(key)) byColumn.set(key, [])
              byColumn.get(key).push(entry)
            }

            return (
              <tr
                key={date}
                className={phName ? 'bg-accent-tint' : isWeekend ? 'bg-canvas-sunken/60' : ''}
              >
                <td className="relative px-1 py-0.5 text-ink-muted">
                  <button
                    type="button"
                    disabled={!phName}
                    onClick={() => phName && setOpenPH(openPH === date ? null : date)}
                    className={`group w-full text-left ${phName ? 'font-semibold text-accent' : ''}`}
                  >
                    {Number(date.slice(-2))}{WEEKDAY_SHORT[dow][0]}
                    {phName && (
                      <span
                        className={`absolute left-0 top-full z-20 mt-0.5 whitespace-nowrap rounded border border-slate-line bg-canvas-raised px-1.5 py-0.5 text-[11px] font-normal text-ink shadow-card ${openPH === date ? 'block' : 'hidden group-hover:block'}`}
                      >
                        {phName}
                      </span>
                    )}
                  </button>
                </td>
                {GRID_COLUMNS.map(col => {
                  const colEntries = byColumn.get(col.key) || []
                  return (
                    <td key={col.key} className="px-1 py-0.5">
                      {colEntries.map((e, i) => (
                        <span key={e.profileId} className={e.status === 'pending' ? 'italic text-ink-muted' : 'text-ink'}>
                          {e.surname}{i < colEntries.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
