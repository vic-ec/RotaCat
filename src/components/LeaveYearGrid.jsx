import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, COLUMN_BADGE_LABEL, splitForOverflow,
  quartersForYear, datesInMonth, weeksForMonth,
} from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { dayOfWeek, todayStr } from '../lib/dateRange'
import { annualDaysSummary } from '../lib/leaveRequests'
import { useAuth } from '../context/AuthContext'
import CategoryBadge, { CategoryOverflowChip } from './CategoryBadge'
import DateStepper from './DateStepper'
import LegendSheet from './LegendSheet'
import { QuickSelectButton } from './Toolbar'

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const GRID_COLUMNS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]
const VIEW_OPTIONS = [{ value: 'mine', label: 'My leave' }, { value: 'all', label: 'All' }]

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
export default function LeaveYearGrid({ year, onYearChange, leaveByDate, displayNames = new Map(), publicHolidaysByDate, rotationsByDoctorId, maxByColumnKey, myProfileId }) {
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

  function goToMonth(newYear, newMonth) {
    if (newYear !== year) onYearChange(newYear)
    setViewMonth(newMonth)
  }

  return (
    <div className="mt-4">
      {myProfileId && (
        <div className="mb-3 flex justify-center">
          <QuickSelectButton
            icon={<Users className="h-4 w-4" />}
            label="View"
            value={showMineOnly ? 'mine' : 'all'}
            onChange={v => setShowMineOnly(v === 'mine')}
            options={VIEW_OPTIONS}
            isActive={showMineOnly}
          />
        </div>
      )}

      {/* Desktop: full year, 4 quarters of 3 months */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-center">
          <DateStepper unit="year" year={year} onChange={onYearChange} showToday={false} />
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
                    displayNames={displayNames}
                    publicHolidaysByDate={publicHolidaysByDate}
                    rotationsByDoctorId={rotationsByDoctorId}
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
        <div className="flex flex-wrap items-center justify-center">
          <DateStepper unit="month" year={year} month={viewMonth} onChange={goToMonth}>
            <LegendSheet
              trigger={onClick => (
                <button
                  type="button"
                  onClick={onClick}
                  className="rounded-full bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent"
                >
                  Legend
                </button>
              )}
            >
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm text-ink-muted">
                {legendColumns.map(col => (
                  <span key={col.key} className="flex items-center gap-1.5">
                    <CategoryBadge label={COLUMN_BADGE_LABEL[col.key]} size={16} />
                    {col.label}
                  </span>
                ))}
              </div>
            </LegendSheet>
          </DateStepper>
        </div>

        <MonthGlance
          year={year}
          month={viewMonth}
          leaveByDate={visibleLeaveByDate}
          publicHolidaysByDate={publicHolidaysByDate}
          rotationsByDoctorId={rotationsByDoctorId}
          onSelectDate={setSelectedDate}
        />
      </div>

      {selectedDate && (
        <DayDetailSheet
          date={selectedDate}
          entries={visibleLeaveByDate.get(selectedDate) || []}
          phName={publicHolidaysByDate.get(selectedDate)}
          displayNames={displayNames}
          maxByColumnKey={maxByColumnKey}
          visibleColumns={legendColumns}
          rotationsByDoctorId={rotationsByDoctorId}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}

function MonthGlance({ year, month, leaveByDate, publicHolidaysByDate, rotationsByDoctorId, onSelectDate }) {
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
          // One key per person on leave that day, not deduped per category
          // — see MonthWorkspace.jsx's MobileDayCell for why (same bug, same
          // fix, both feeding the same splitForOverflow).
          const columnsPresent = entries.map(e =>
            resolveLeaveCapacityColumn({ category: e.category, profileId: e.profileId, date: e.dateFrom, rotationsByDoctorId })
          ).filter(Boolean)
          const { shown, overflow } = splitForOverflow(columnsPresent)
          const isToday = date === today

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`flex min-h-[58px] flex-col items-center justify-start gap-1 rounded border bg-canvas-raised pt-1 text-xs ${
                phName ? 'border-ink ring-1 ring-inset ring-ink' : 'border-slate-line'
              } ${isToday ? 'ring-1 ring-accent' : ''} hover:bg-canvas-sunken`}
            >
              <span className={`text-ink ${phName ? 'font-semibold' : ''}`}>{Number(date.slice(-2))}</span>
              {columnsPresent.length > 0 && (
                <span className="grid grid-cols-2 gap-0.5">
                  {shown.map((key, i) => <CategoryBadge key={`${key}-${i}`} label={COLUMN_BADGE_LABEL[key]} size={14} />)}
                  {overflow > 0 && <CategoryOverflowChip count={overflow} size={14} />}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DayDetailSheet({ date, entries, phName, displayNames = new Map(), maxByColumnKey, visibleColumns, rotationsByDoctorId, onClose }) {
  const byColumn = new Map()
  for (const entry of entries) {
    const key = resolveLeaveCapacityColumn({ category: entry.category, profileId: entry.profileId, date: entry.dateFrom, rotationsByDoctorId })
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
                  <CategoryBadge label={COLUMN_BADGE_LABEL[col.key]} size={18} />
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
                          <span className={e.status === 'pending' ? 'italic text-ink-muted' : 'text-ink'}>{displayNames.get(e.profileId) ?? e.surname}</span>
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

function MonthTable({ year, month, label, leaveByDate, displayNames = new Map(), publicHolidaysByDate, rotationsByDoctorId, maxByColumnKey, openPH, setOpenPH }) {
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
              const key = resolveLeaveCapacityColumn({ category: entry.category, profileId: entry.profileId, date: entry.dateFrom, rotationsByDoctorId })
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
                          {displayNames.get(e.profileId) ?? e.surname}{i < colEntries.length - 1 ? ', ' : ''}
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
