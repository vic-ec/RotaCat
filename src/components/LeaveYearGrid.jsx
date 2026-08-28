import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, COLUMN_BADGE_LABEL, splitForOverflow,
  quartersForYear, datesInMonth, weeksForMonth,
} from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { dayOfWeek, todayStr, formatShortDateRange } from '../lib/dateRange'
import { shortLeaveTypeLabel } from '../lib/leaveRequests'
import { useAuth } from '../context/AuthContext'
import CategoryBadge, { CategoryOverflowChip } from './CategoryBadge'
import DateStepper from './DateStepper'
import LegendSheet from './LegendSheet'
import { LegendIcon } from './PlannerIcons'
import { QuickSelectButton } from './Toolbar'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'

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
export default function LeaveYearGrid({ year, onYearChange, leaveByDate, displayNames = new Map(), publicHolidaysByDate, rotationsByDoctorId, maxByColumnKey, myProfileId, ruleIntro, ruleBullets }) {
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
        {/* Same legend/rules entry point as mobile. Desktop shows the whole
            year at once and never had one, so folding the rules card into
            the legend icon would have left desktop with no way to reach
            them at all. */}
        <div className="flex items-center justify-center gap-2">
          <DateStepper unit="year" year={year} onChange={onYearChange} showToday={false} />
          <LegendSheet
            ruleIntro={ruleIntro}
            ruleBullets={ruleBullets}
            trigger={onClick => (
              <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-secondary h-[30px] w-[30px] p-0">
                <LegendIcon className="h-4 w-4" />
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
              ruleIntro={ruleIntro}
              ruleBullets={ruleBullets}
              trigger={onClick => (
                <button
                  type="button"
                  onClick={onClick}
                  aria-label="Legend"
                  title="Legend"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent-tint text-accent"
                >
                  <LegendIcon className="h-4 w-4" />
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

function DayDetailSheet({ date, entries, phName, displayNames = new Map(), visibleColumns, rotationsByDoctorId, onClose }) {
  // One flat, chronological list rather than a row per capacity column with
  // "—" against the empty ones. This mirrors MonthWorkspace's own day
  // review on the Annual planner, deliberately: the two planners' day views
  // used to answer the same question in two different shapes. Special leave
  // also has no per-column cap to report (that rule is annual-only), so the
  // column grouping was carrying a header and an em-dash per category
  // purely to say "nobody" — a lot of sheet for no information.
  //
  // A doctor whose category doesn't resolve to a capacity column falls back
  // to the Consultant/Other column instead of being dropped, so nobody
  // silently vanishes from a day they're actually off on.
  // Still scoped to visibleColumns, which is how a non-admin is kept from
  // seeing Consultant leave. Flattening the old per-column sections must
  // not quietly widen who can see what — the grouping was cosmetic, that
  // filter is not.
  const visibleKeys = new Set((visibleColumns ?? GRID_COLUMNS).map(c => c.key))
  const rows = entries
    .map(entry => {
      const key = resolveLeaveCapacityColumn({
        category: entry.category, profileId: entry.profileId, date: entry.dateFrom, rotationsByDoctorId,
      }) ?? LEAVE_OTHER_COLUMN.key
      const column = GRID_COLUMNS.find(c => c.key === key) ?? LEAVE_OTHER_COLUMN
      return { ...entry, columnKey: key, columnLabel: column.label }
    })
    .filter(row => visibleKeys.has(row.columnKey))

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

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">No one is on leave today</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-line border-t border-slate-line">
            {rows.map(e => (
              <li key={`${e.profileId}-${e.leaveType}-${e.dateFrom}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryBadge label={COLUMN_BADGE_LABEL[e.columnKey]} size={18} />
                  <span className="flex-shrink-0 text-sm font-medium text-ink">{displayNames.get(e.profileId) ?? e.surname}</span>
                  <span className="truncate text-xs text-ink-muted">
                    {[
                      e.columnLabel,
                      e.leaveType ? shortLeaveTypeLabel(e.leaveType) : null,
                      e.dateFrom && e.dateTo ? formatShortDateRange(e.dateFrom, e.dateTo) : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={`flex-shrink-0 text-xs font-medium ${e.status === 'pending' ? 'text-flagAmber' : 'text-success'}`}>
                  {e.status === 'pending' ? REVIEW_STATUS_LABELS.pending : 'Approved'}
                </span>
              </li>
            ))}
          </ul>
        )}
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
