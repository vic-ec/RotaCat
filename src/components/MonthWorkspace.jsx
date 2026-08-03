import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { todayStr, formatWeekdayDate, formatShortDateRange } from '../lib/dateRange'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, COLUMN_DOT_COLOR, LEAVE_CAPACITY_STATES, weeksForMonth, monthsForYear,
  totalLeaveSlotsForDate, capacityStateForCount,
} from '../lib/leaveYearGrid'
import { dayEntriesByColumn, dayCapacitySummary, checkApprovalCapacityImpact } from '../lib/monthWorkspace'
import { getApprovalWarnings, approveLeaveRequest, rejectLeaveRequest } from '../lib/leaveApprovals'
import { annualDaysSummary } from '../lib/leaveRequests'
import LeaveRequestForm from './LeaveRequestForm'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const GRID_COLUMNS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

function hasWarnings(w) {
  return Boolean(w) && (w.supervisionBreaches.length > 0 || w.balanceWarnings.length > 0 || Boolean(w.hourCeilingWarning))
}

// The Annual planner's detailed single-month view — opened from the year
// overview's "Open month workspace" action (or its Month toggle) for
// whichever month was selected there. A real calendar grid (full weekday
// names, week rows), not the old day-row spreadsheet: reading surnames and
// checking capacity happen straight off the grid, and clicking a day opens
// a review panel for reading pending requests, approving/rejecting them
// (with the same Tier-2 warnings and a capacity-breach check surfaced),
// and submitting new leave for that day.
//
// Reuses the same year-wide fetch AnnualLeavePlanner.jsx already holds for
// the overview (approvedByDate/pendingByDate/etc.) rather than fetching
// again — this view is just a different lens on the same data, filtered to
// one month by the calendar itself.
export default function MonthWorkspace({
  year, month, onMonthChange, approvedByDate, pendingByDate, approvedRows, pendingRows,
  countByColumnPerDate, publicHolidaysByDate, highlightDate, onHighlightConsumed, maxByColumnKey, maxFullTime, onDataChanged, onBack,
}) {
  const { isAdmin } = useAuth()
  // Consultant leave is only ever visible to an admin (or another
  // Consultant — see EC_LEAVE_PLANNER_RULES.md's Consultant privacy rule),
  // so a non-admin viewer shouldn't see the category referenced at all —
  // neither in this legend nor in DayReviewModal's per-category breakdown
  // (which has its own identical filter, since it gets isAdmin from its
  // own useAuth() call rather than as a prop from here).
  const legendColumns = isAdmin ? GRID_COLUMNS : GRID_COLUMNS.filter(col => col.key !== 'Other')

  // Which day's review sheet is open lives in the URL (`day=YYYY-MM-DD`),
  // not plain useState — same reasoning as AnnualLeavePlanner.jsx's
  // ayear/aview/amonth: a backgrounded mobile browser/PWA can get killed and
  // reloaded by the OS at any time, and the URL is what survives that,
  // reopening this same day's sheet instead of silently closing it.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDate = searchParams.get('day')

  function setSelectedDate(date) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (date) next.set('day', date)
      else next.delete('day')
      return next
    }, { replace: true })
  }

  const today = todayStr()
  const weeks = weeksForMonth(year, month)
  const monthLabel = monthsForYear(year)[month - 1].label

  // highlightDate seeds the initially-open day (e.g. the Requests queue's
  // "View Calendar" action landing straight on that request's date) — a
  // one-shot: only writes `day` into the URL if nothing's open there yet
  // (a reload with an already-open day should keep showing that day, not
  // get overridden by a stale highlight prop).
  useEffect(() => {
    if (highlightDate && !selectedDate) setSelectedDate(highlightDate)
    if (highlightDate) onHighlightConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever run once on mount, consuming whatever highlightDate this instance was seeded with
  }, [])

  function goPrevMonth() {
    if (month === 1) onMonthChange(year - 1, 12)
    else onMonthChange(year, month - 1)
  }
  function goNextMonth() {
    if (month === 12) onMonthChange(year + 1, 1)
    else onMonthChange(year, month + 1)
  }
  function goToday() {
    const now = new Date()
    onMonthChange(now.getFullYear(), now.getMonth() + 1)
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn-secondary text-sm">← Back to overview</button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={goPrevMonth} className="btn-secondary px-2 py-1 text-sm" aria-label="Previous month">←</button>
          <span className="font-display text-base font-semibold text-ink">{monthLabel} {year}</span>
          <button type="button" onClick={goNextMonth} className="btn-secondary px-2 py-1 text-sm" aria-label="Next month">→</button>
          <button type="button" onClick={goToday} className="btn-secondary px-2 py-1 text-xs">Today</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {legendColumns.map(col => (
          <span key={col.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ring-1 ring-white ${COLUMN_DOT_COLOR[col.key]}`} />
            {col.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink/10 ring-1 ring-inset ring-ink-muted" /> Public holiday</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {LEAVE_CAPACITY_STATES.map(state => (
          <span key={state.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${state.light}`} /> {state.label}
          </span>
        ))}
      </div>

      {/* Desktop (lg+): full weekday-name grid, surnames inline on the cell.
          Mobile (<lg): a compact glance grid (day number + category dots
          only, same treatment as the Special Leave planner's mobile
          calendar in LeaveYearGrid.jsx) — reading surnames happens in the
          tap-opened day sheet below instead of being crammed into a
          phone-width cell. */}
      <div className="mt-3 hidden overflow-hidden rounded-lg border border-slate-line lg:block">
        <div className="grid grid-cols-7 border-b border-slate-line bg-canvas-sunken">
          {WEEKDAY_NAMES.map(d => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-ink-muted">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((date, i) => date ? (
            <DayCell
              key={date}
              date={date}
              isToday={date === today}
              phName={publicHolidaysByDate.get(date)}
              entriesByColumn={dayEntriesByColumn(date, { approvedByDate, pendingByDate })}
              capacityState={capacityStateForCount(totalLeaveSlotsForDate(date, countByColumnPerDate))}
              onClick={() => setSelectedDate(date)}
            />
          ) : (
            <div key={`blank-${i}`} className="min-h-[100px] border-b border-r border-slate-line bg-canvas-sunken/30" />
          ))}
        </div>
      </div>

      <div className="mt-3 lg:hidden">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-muted">
          {WEEKDAY_SHORT.map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {weeks.flat().map((date, i) => date ? (
            <MobileDayCell
              key={date}
              date={date}
              isToday={date === today}
              isPublicHoliday={Boolean(publicHolidaysByDate.get(date))}
              columnsPresent={[...dayEntriesByColumn(date, { approvedByDate, pendingByDate }).keys()]}
              capacityState={capacityStateForCount(totalLeaveSlotsForDate(date, countByColumnPerDate))}
              onClick={() => setSelectedDate(date)}
            />
          ) : (
            <div key={`blank-${i}`} />
          ))}
        </div>
      </div>

      {selectedDate && (
        <DayReviewModal
          date={selectedDate}
          entriesByColumn={dayEntriesByColumn(selectedDate, { approvedByDate, pendingByDate })}
          capacity={dayCapacitySummary(selectedDate, countByColumnPerDate, maxByColumnKey)}
          phName={publicHolidaysByDate.get(selectedDate)}
          approvedRows={approvedRows}
          pendingRows={pendingRows}
          maxByColumnKey={maxByColumnKey}
          maxFullTime={maxFullTime}
          onDataChanged={onDataChanged}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}

function DayCell({ date, isToday, phName, entriesByColumn, capacityState, onClick }) {
  const dateNum = Number(date.slice(-2))

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[100px] flex-col items-stretch gap-1 border-b border-r border-slate-line p-2 text-left transition-colors hover:brightness-95 ${phName ? 'ring-2 ring-inset ring-ink' : ''} ${capacityState.light}`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
          isToday ? 'bg-accent text-white' : capacityState.onFillText
        }`}>
          {dateNum}
        </span>
      </div>
      {phName && <span className={`truncate text-[10px] font-medium ${capacityState.onFillMuted}`}>{phName}</span>}
      <div className="flex-1 space-y-0.5 overflow-hidden">
        {[...entriesByColumn.entries()].map(([key, entries]) => (
          <div key={key} className="flex items-start gap-1 text-[11px] leading-tight">
            <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ring-1 ring-white ${COLUMN_DOT_COLOR[key]}`} />
            <span className="truncate">
              {entries.map((e, i) => (
                <span key={e.profileId} className={e.status === 'pending' ? `italic ${capacityState.onFillMuted}` : capacityState.onFillText}>
                  {e.surname}{i < entries.length - 1 ? ', ' : ''}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </button>
  )
}

function MobileDayCell({ date, isToday, isPublicHoliday, columnsPresent, capacityState, onClick }) {
  const dateNum = Number(date.slice(-2))

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex aspect-square flex-col items-center justify-center rounded border text-xs ${capacityState.light} ${
        isPublicHoliday ? 'border-ink ring-1 ring-inset ring-ink' : 'border-slate-line'
      } ${isToday ? 'ring-1 ring-accent' : ''} hover:brightness-95`}
    >
      <span className={`${capacityState.onFillText} ${isPublicHoliday ? 'font-semibold' : ''}`}>{dateNum}</span>
      <span className="mt-0.5 flex h-1.5 gap-0.5">
        {columnsPresent.map(key => (
          <span key={key} className={`h-1.5 w-1.5 rounded-full ring-1 ring-white ${COLUMN_DOT_COLOR[key]}`} />
        ))}
      </span>
    </button>
  )
}

function DayReviewModal({
  date, entriesByColumn, capacity, phName, approvedRows, pendingRows, maxByColumnKey, maxFullTime, onDataChanged, onClose,
}) {
  const { user, isAdmin, canSubmitLeave } = useAuth()
  // See MonthWorkspace's own legendColumns above — same Consultant-privacy
  // filter, computed separately here since this is a different component
  // with its own useAuth() call.
  const visibleColumns = isAdmin ? GRID_COLUMNS : GRID_COLUMNS.filter(col => col.key !== 'Other')
  const [warningsById, setWarningsById] = useState({})
  const [actioningId, setActioningId] = useState(null)
  const [confirmingApproveId, setConfirmingApproveId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [error, setError] = useState('')
  const [showRequestForm, setShowRequestForm] = useState(false)

  const pendingRequestsThisDate = pendingRows.filter(r => r.date_from <= date && r.date_to >= date)
  const allRows = [...approvedRows, ...pendingRows]

  useEffect(() => {
    let cancelled = false
    async function loadWarnings() {
      const entries = await Promise.all(
        pendingRequestsThisDate.map(async r => [r.id, await getApprovalWarnings(r)])
      )
      if (!cancelled) setWarningsById(Object.fromEntries(entries))
    }
    if (isAdmin && pendingRequestsThisDate.length > 0) loadWarnings()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs when the reviewed date changes; pendingRequestsThisDate is derived fresh each render
  }, [date, isAdmin])

  async function handleApprove(request) {
    setActioningId(request.id)
    try {
      await approveLeaveRequest(request, user.id)
    } catch (err) {
      setError(err.message)
      setActioningId(null)
      return
    }
    setConfirmingApproveId(null)
    setActioningId(null)
    onDataChanged()
  }

  async function handleReject(request) {
    setActioningId(request.id)
    try {
      await rejectLeaveRequest(request, user.id, rejectNotes)
    } catch (err) {
      setError(err.message)
      setActioningId(null)
      return
    }
    setRejectingId(null)
    setRejectNotes('')
    setActioningId(null)
    onDataChanged()
  }

  const formattedDate = formatWeekdayDate(date)
  const totalSlots = capacity.reduce((sum, col) => sum + col.count, 0)
  const dayCapacityState = capacityStateForCount(totalSlots)
  // Once the combined cap is reached, no more slots are available in ANY
  // category regardless of that category's own headroom (e.g. MO showing
  // "1/2" would wrongly suggest a 3rd doctor could still go on leave) — so
  // every column's count is replaced with "—" rather than a real x/y.
  const atFullCapacity = totalSlots >= maxFullTime

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-ink">{formattedDate}</h2>
          <div className="flex items-center gap-2">
            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${dayCapacityState.light} ${dayCapacityState.onFillText}`}>
              {totalSlots} of 3 slots taken
            </span>
            <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
          </div>
        </div>
        {phName && <p className="mt-1 inline-block rounded bg-ink/5 px-2 py-0.5 text-sm font-medium text-ink-light">{phName}</p>}
        {error && <p className="mt-2 text-sm text-flagRed">{error}</p>}

        {showRequestForm ? (
          <div className="mt-4">
            <button type="button" onClick={() => setShowRequestForm(false)} className="text-xs font-medium text-accent hover:underline">
              ‹ Back
            </button>
            <div className="mt-2">
              <LeaveRequestForm
                initialDateFrom={date}
                initialDateTo={date}
                onSubmitted={() => { setShowRequestForm(false); onDataChanged() }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {capacity.map(col => (
                <div key={col.key} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-ink-muted">
                    <span className={`h-2 w-2 rounded-full ${COLUMN_DOT_COLOR[col.key]}`} />
                    {col.label}
                  </span>
                  <span className={atFullCapacity ? 'text-ink-muted' : col.atCap ? 'font-medium text-flagAmber' : 'text-ink'}>
                    {atFullCapacity ? '—' : `${col.count}/${col.max}`}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 divide-y divide-slate-line border-t border-slate-line">
              {visibleColumns.map(col => {
                const entries = entriesByColumn.get(col.key) || []
                return (
                  <div key={col.key} className="py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{col.label}</p>
                    {entries.length === 0 ? (
                      <p className="mt-1 text-sm text-ink-muted">—</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {entries.map(e => (
                          <li key={e.profileId} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex items-center gap-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                e.status === 'pending' ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
                              }`}>
                                {e.surname}
                              </span>
                              <span className="text-xs text-ink-muted">{formatShortDateRange(e.dateFrom, e.dateTo)}</span>
                            </span>
                            <span className={`flex-shrink-0 text-xs font-medium ${e.status === 'pending' ? 'text-flagAmber' : 'text-success'}`}>
                              {e.status === 'pending' ? 'Pending' : 'Approved'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>

            {isAdmin && pendingRequestsThisDate.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-slate-line pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pending requests</p>
                {pendingRequestsThisDate.map(request => {
                  const w = warningsById[request.id]
                  const warned = hasWarnings(w)
                  const impact = checkApprovalCapacityImpact(
                    request, allRows.filter(r => r.id !== request.id), maxByColumnKey, maxFullTime
                  )
                  const capacityWarned = impact.applicable && (impact.columnBreach || impact.fullTimeBreach)
                  const confirming = confirmingApproveId === request.id
                  const isActioning = actioningId === request.id

                  return (
                    <div key={request.id} className="rounded-lg border border-slate-line p-3">
                      <p className="text-sm font-medium text-ink">
                        {request.profiles?.name} {request.profiles?.surname}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {request.date_from === request.date_to
                          ? formatWeekdayDate(request.date_from)
                          : `${formatWeekdayDate(request.date_from)} → ${formatWeekdayDate(request.date_to)}`}
                      </p>
                      {annualDaysSummary(request) && <p className="text-xs text-ink-muted">{annualDaysSummary(request)}</p>}
                      {request.notes && <p className="mt-1 text-xs italic text-ink-light">&quot;{request.notes}&quot;</p>}

                      {capacityWarned && (
                        <div className="mt-2 flex items-start gap-1.5 rounded border border-flagAmber bg-flagAmber-bg p-2 text-xs text-flagAmber">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                          <span>
                            Approving would breach the {impact.fullTimeBreach ? 'full-time doctor' : impact.columnLabel} cap on {(impact.columnBreachDates[0] || impact.fullTimeBreachDates[0])}.
                          </span>
                        </div>
                      )}
                      {warned && (
                        <div className="mt-2 space-y-1 rounded border border-flagAmber bg-flagAmber-bg p-2">
                          {w.supervisionBreaches.length > 0 && (
                            <p className="text-xs text-flagAmber">
                              ⚠ Approving would drop supervision below the required minimum on {w.supervisionBreaches.length} shift{w.supervisionBreaches.length !== 1 ? 's' : ''}.
                            </p>
                          )}
                          {w.balanceWarnings.map(bw => (
                            <p key={bw.year} className="text-xs text-flagAmber">
                              ⚠ {bw.year} annual leave balance would go negative ({bw.remainingAfter} of {bw.daysAllotted} days remaining).
                            </p>
                          ))}
                          {w.hourCeilingWarning && (
                            <p className="text-xs text-flagAmber">
                              ⚠ Five-eighths doctor already has {w.hourCeilingWarning.alreadyRosteredHours}h rostered this month (ceiling: {w.hourCeilingWarning.maxHours}h).
                            </p>
                          )}
                        </div>
                      )}

                      {rejectingId === request.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={rejectNotes}
                            onChange={e => setRejectNotes(e.target.value)}
                            placeholder="Reason (optional, visible to the doctor)…"
                            rows={2}
                            className="input-field w-full"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReject(request)}
                              disabled={isActioning}
                              className="rounded border border-flagRed px-3 py-1 text-xs font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isActioning ? 'Rejecting…' : 'Confirm reject'}
                            </button>
                            <button onClick={() => { setRejectingId(null); setRejectNotes('') }} className="btn-secondary text-xs">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => (warned || capacityWarned) && !confirming ? setConfirmingApproveId(request.id) : handleApprove(request)}
                            disabled={isActioning || warningsById[request.id] === undefined}
                            className="btn-primary text-xs"
                          >
                            {isActioning ? 'Approving…' : (warned || capacityWarned) ? (confirming ? 'Confirm approval' : 'Approve anyway') : 'Approve'}
                          </button>
                          <button onClick={() => setRejectingId(request.id)} disabled={isActioning} className="btn-secondary text-xs">
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {canSubmitLeave && (
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className="btn-secondary mt-4 w-full text-sm"
              >
                Request annual leave for this day
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
