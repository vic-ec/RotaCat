import { useState } from 'react'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, columnForLeaveCategory,
  quartersForYear, datesInMonth,
} from '../lib/leaveYearGrid'
import { dayOfWeek } from '../lib/dateRange'

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const GRID_COLUMNS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

// Shared year-at-a-glance grid for the Annual Leave and Special Leave
// planner tabs — 4 quarters of 3 months each, matching the team's existing
// spreadsheet. Purely presentational: callers pre-shape leaveByDate entries
// as { profileId, surname, category, status } and public holidays as a
// date -> name map; this component just lays them out.
//
// maxByColumnKey (optional) shows a "(max N)" hint in each capped column's
// header — pass it for the Annual Leave tab, omit it for Special Leave
// (which has no concurrency cap).
export default function LeaveYearGrid({ year, onYearChange, leaveByDate, publicHolidaysByDate, maxByColumnKey }) {
  const [openPH, setOpenPH] = useState(null) // date string or null

  return (
    <div className="mt-4">
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
                  leaveByDate={leaveByDate}
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
