import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TriangleAlert, ChevronLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { todayStr, formatWeekdayDate, formatShortDateRange } from '../lib/dateRange'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, LEAVE_FULL_TIME_GROUP_KEYS, COLUMN_BADGE_LABEL, COLUMN_FULL_LABEL, LEAVE_CAPACITY_STATES,
  weeksForMonth, monthsForYear, totalLeaveSlotsForDate, capacityStateForCount, totalLeaveCeiling,
  splitForOverflow,
} from '../lib/leaveYearGrid'
import {
  dayEntriesByColumn, dayCapacitySummary, checkApprovalCapacityImpact, daysWithRoomForCategory, categoryPressureState,
  myCategoryDaySlots, myCategoryCapacityStateForDate, myCategoryLegendStates,
} from '../lib/monthWorkspace'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { getApprovalWarnings, approveLeaveRequest, rejectLeaveRequest } from '../lib/leaveApprovals'
import { annualDaysSummary } from '../lib/leaveRequests'
import CategoryBadge, { CategoryOverflowChip } from './CategoryBadge'
import DateStepper from './DateStepper'
import InlineRuleHint from './InlineRuleHint'
import LeaveCapacityBanner from './LeaveCapacityBanner'
import LeaveRequestForm from './LeaveRequestForm'
import Modal from './Modal'
import SelectMenu from './SelectMenu'

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
  countByColumnPerDate, publicHolidaysByDate, rotationsByDoctorId, highlightDate, onHighlightConsumed, maxByColumnKey, maxFullTime, onDataChanged, onBack,
  ruleHintIntro, ruleHintBullets,
}) {
  const { isAdmin, profile } = useAuth()
  // Consultant leave is only ever visible to an admin (or another
  // Consultant — see EC_LEAVE_PLANNER_RULES.md's Consultant privacy rule),
  // so a non-admin viewer shouldn't see the category referenced at all —
  // neither in this legend nor in DayReviewModal's per-category breakdown
  // (which has its own identical filter, since it gets isAdmin from its
  // own useAuth() call rather than as a prop from here).
  const legendColumns = isAdmin ? GRID_COLUMNS : GRID_COLUMNS.filter(col => col.key !== 'Other')
  // Collapsed by default — same reasoning as LeaveYearGrid.jsx's mobile
  // legend: the badges are letter-labelled now, so this is a reference for
  // anyone who wants it rather than something needed to read the grid.
  const [legendOpen, setLegendOpen] = useState(false)

  // First of the month being VIEWED (not today) — an Intern's own column
  // here should reflect whichever rotation covers the month this workspace
  // is currently showing, so browsing into a future/past month with a
  // different rotation reads correctly rather than always showing today's.
  const monthStartDate = `${year}-${String(month).padStart(2, '0')}-01`

  // The mobile day-cell grid (MobileDayCell, <lg) fills each day by the
  // viewer's own pool for a non-admin doctor with a resolvable capacity
  // column, instead of the generic cross-category total — see
  // myCategoryCapacityStateForDate. Admins, and anyone without a category
  // column (Consultant, no profile), keep the generic total-based read
  // everywhere, including on their own mobile view — their job there is
  // still cross-category exception spotting, not personal planning. The
  // desktop grid (DayCell, lg+) always stays generic regardless of role.
  const myColumnKey = resolveLeaveCapacityColumn({ category: profile?.category, contractType: profile?.contract_type, profileId: profile?.id, date: monthStartDate, rotationsByDoctorId })
  const myColumnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === myColumnKey)
  const personalizeFill = !isAdmin && Boolean(myColumnDef)
  const mobileLegendStates = personalizeFill ? myCategoryLegendStates(myColumnKey) : LEAVE_CAPACITY_STATES

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

  // "Request leave" from the mobile Your Leave card (below) should open the
  // same in-context form as tapping a day and hitting "Request annual leave
  // for this day" — not send the doctor off to the separate My Leave tab.
  // Picks today if it falls in the month being viewed, else the 1st, so the
  // date fields still start prefilled with something sensible for a future
  // month the doctor is just browsing ahead into.
  const [openRequestFormOnOpen, setOpenRequestFormOnOpen] = useState(false)
  function openRequestLeave() {
    const isCurrentMonth = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7))
    setOpenRequestFormOnOpen(true)
    setSelectedDate(isCurrentMonth ? today : `${year}-${String(month).padStart(2, '0')}-01`)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink"
        >
          ← Overview
        </button>
        <DateStepper unit="month" year={year} month={month} onChange={onMonthChange}>
          <button
            type="button"
            onClick={() => setLegendOpen(o => !o)}
            aria-expanded={legendOpen}
            className="btn-secondary h-[30px] px-2.5 text-xs"
          >
            Legend
          </button>
          <InlineRuleHint iconOnly intro={ruleHintIntro} bullets={ruleHintBullets} />
        </DateStepper>
      </div>

      {legendOpen && (
        <>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
            {legendColumns.map(col => (
              <span key={col.key} className="flex items-center gap-1.5">
                <CategoryBadge label={COLUMN_BADGE_LABEL[col.key]} size={18} />
                {col.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink/10 ring-1 ring-inset ring-ink-muted" /> Public holiday</span>
          </div>
          {/* Two variants, gated by viewport rather than role directly —
              this mirrors which day-cell grid (DayCell vs MobileDayCell)
              each breakpoint actually shows below, so the legend always
              matches the fill colours the viewer can currently see: the
              desktop grid stays generic for everyone, so its legend does
              too, while the mobile grid personalises for a non-admin
              viewer with a category, so its legend follows suit. */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted lg:hidden">
            {mobileLegendStates.map(state => (
              <span key={state.key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${state.light}`} /> {state.label}
              </span>
            ))}
          </div>
          <div className="mt-1.5 hidden flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted lg:flex">
            {LEAVE_CAPACITY_STATES.map(state => (
              <span key={state.key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${state.light}`} /> {state.label}
              </span>
            ))}
          </div>
        </>
      )}

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
              entriesByColumn={dayEntriesByColumn(date, { approvedByDate, pendingByDate }, rotationsByDoctorId)}
              capacityState={capacityStateForCount(totalLeaveSlotsForDate(date, countByColumnPerDate))}
              onClick={() => setSelectedDate(date)}
            />
          ) : (
            <div key={`blank-${i}`} className="min-h-[104px] border-b border-r border-slate-line bg-canvas-sunken/30" />
          ))}
        </div>
      </div>

      <div className="mt-3 lg:hidden">
        <YourLeaveCard
          profile={profile}
          year={year}
          month={month}
          monthLabel={monthLabel}
          maxByColumnKey={maxByColumnKey}
          maxFullTime={maxFullTime}
          countByColumnPerDate={countByColumnPerDate}
          rotationsByDoctorId={rotationsByDoctorId}
          onRequestLeave={openRequestLeave}
        />
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
              columnsPresent={[...dayEntriesByColumn(date, { approvedByDate, pendingByDate }, rotationsByDoctorId).keys()]}
              capacityState={
                personalizeFill
                  ? myCategoryCapacityStateForDate(date, myColumnKey, maxByColumnKey, maxFullTime, countByColumnPerDate)
                  : capacityStateForCount(totalLeaveSlotsForDate(date, countByColumnPerDate))
              }
              onClick={() => setSelectedDate(date)}
            />
          ) : (
            <div key={`blank-${i}`} />
          ))}
        </div>
      </div>

      {selectedDate && (
        <DayReviewModal
          key={selectedDate}
          date={selectedDate}
          entriesByColumn={dayEntriesByColumn(selectedDate, { approvedByDate, pendingByDate }, rotationsByDoctorId)}
          capacity={dayCapacitySummary(selectedDate, countByColumnPerDate, maxByColumnKey)}
          phName={publicHolidaysByDate.get(selectedDate)}
          approvedRows={approvedRows}
          pendingRows={pendingRows}
          maxByColumnKey={maxByColumnKey}
          maxFullTime={maxFullTime}
          rotationsByDoctorId={rotationsByDoctorId}
          initialShowRequestForm={openRequestFormOnOpen}
          onDataChanged={onDataChanged}
          onClose={() => { setSelectedDate(null); setOpenRequestFormOnOpen(false) }}
        />
      )}
    </div>
  )
}

// Mobile-only personalised summary, replacing the old flat admin-style stat
// strip: leads with the one question a doctor actually opens this page to
// answer ("can I take leave, and when's easiest?") by showing how many days
// this month still have room in *their own* category, not a generic
// headcount. Renders nothing for a viewer whose category has no capacity
// column (Consultant, Locum, or no signed-in profile) — there's nothing to
// personalise for them.
//
// "Check other" lets the viewer preview a DIFFERENT column's room for this
// same month — useful for an Intern browsing ahead into a month they expect
// to be on a different EC/OT rotation for, without waiting for their
// intern_rotations row to be updated first. Purely a display override: it
// doesn't change which pool a submitted request actually lands in (that's
// always resolved fresh off the real profile/rotation at submission time —
// see resolveLeaveCapacityColumn) — a note below makes that explicit
// whenever an override is active, and it resets on every month change so a
// stale "previewing OT" state can't silently follow the viewer around.
function YourLeaveCard({ profile, year, month, monthLabel, maxByColumnKey, maxFullTime, countByColumnPerDate, rotationsByDoctorId, onRequestLeave }) {
  const { canSubmitLeave } = useAuth()
  const monthStartDate = `${year}-${String(month).padStart(2, '0')}-01`
  const myColumnKey = resolveLeaveCapacityColumn({ category: profile?.category, contractType: profile?.contract_type, profileId: profile?.id, date: monthStartDate, rotationsByDoctorId })
  const myColumnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === myColumnKey)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [overrideColumnKey, setOverrideColumnKey] = useState(null)
  useEffect(() => { setOverrideColumnKey(null); setPickerOpen(false) }, [year, month])

  if (!myColumnDef) return null

  const columnKey = overrideColumnKey ?? myColumnKey
  const columnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === columnKey) ?? myColumnDef
  const isOverridden = overrideColumnKey && overrideColumnKey !== myColumnKey

  const stat = daysWithRoomForCategory(year, month, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDate)
  const state = categoryPressureState(year, month, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDate)
  if (!stat || !state) return null

  return (
    <div className="mb-3 rounded-xl border border-slate-line bg-gradient-to-br from-accent-tint to-canvas p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">
          For {COLUMN_FULL_LABEL[columnKey] ?? columnDef.label} · {monthLabel}
        </p>
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          className="flex-shrink-0 text-[10px] font-semibold text-accent-dark underline decoration-dotted"
        >
          {isOverridden ? 'Change' : 'Check other'}
        </button>
      </div>
      {pickerOpen && (
        <div className="mt-1.5">
          <SelectMenu
            value={columnKey}
            onChange={v => { setOverrideColumnKey(v === myColumnKey ? null : v); setPickerOpen(false) }}
            options={LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label }))}
          />
        </div>
      )}
      {isOverridden && (
        <p className="mt-1 text-[10px] text-ink-muted">
          Previewing {columnDef.label} — your own category is {myColumnDef.label}. Submitting still counts against your real category.{' '}
          <button type="button" onClick={() => setOverrideColumnKey(null)} className="underline">Reset</button>
        </p>
      )}
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`font-display text-3xl font-bold tabular-nums ${state.text}`}>{stat.withRoom}</span>
        <span className="text-xs text-ink-muted">of {stat.total} days have room for {isOverridden ? 'that' : 'your'} category</span>
      </p>
      {canSubmitLeave && (
        <button type="button" onClick={onRequestLeave} className="btn-primary mt-2 block w-full text-center text-xs">
          Request leave
        </button>
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
      className={`flex min-h-[104px] flex-col items-stretch gap-1 border-b border-r border-slate-line p-2 text-left transition-colors hover:brightness-95 ${phName ? 'ring-2 ring-inset ring-ink' : ''} ${capacityState.light}`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
          isToday ? 'bg-accent text-white' : capacityState.onFillText
        }`}>
          {dateNum}
        </span>
      </div>
      {phName && <span className={`truncate text-[10px] font-medium ${capacityState.onFillMuted}`}>{phName}</span>}
      {/* This list clips vertically once it outgrows the cell's fixed
          min-height, via overflow-hidden below — but a `ring` (box-shadow)
          bleeds outside its own box and gets clipped by that same
          overflow-hidden the instant a dot sits flush against the list's
          left edge, no matter how much padding the outer cell has. A real
          `border` stays inside the box model instead, so it can't be cut
          off that way. */}
      <div className="flex-1 space-y-0.5 overflow-hidden">
        {[...entriesByColumn.entries()].map(([key, entries]) => (
          <div key={key} className="flex items-center gap-1 text-[11px] leading-tight">
            <CategoryBadge label={COLUMN_BADGE_LABEL[key]} size={15} />
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
  const { shown, overflow } = splitForOverflow(columnsPresent)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-[64px] flex-col items-center rounded border pt-[23px] text-xs ${capacityState.light} ${
        isPublicHoliday ? 'border-ink ring-1 ring-inset ring-ink' : 'border-slate-line'
      } ${isToday ? 'ring-1 ring-accent' : ''} hover:brightness-95`}
    >
      {/* Pinned to the same corner on every cell via absolute positioning,
          taken out of the flex flow entirely — otherwise this shares the
          flex-col's layout with the badge grid below it, so a 4-badge day
          and a no-badge day put the date number at two different heights.
          The badge grid itself is top-anchored (no `justify-center` on the
          button — flex-col defaults to flex-start), sitting right under
          the `pt-[23px]` reserved for the number (3px of breathing room
          under its own 20px line), at the same fixed position
          whether it holds 1 badge or 4 — not re-centred within whatever
          space is left over depending on occupancy, which previously made
          the same row of badges sit at a different height from one day to
          the next. */}
      <span className={`absolute left-1.5 top-1 font-bold ${capacityState.onFillText}`}>{dateNum}</span>
      {columnsPresent.length > 0 && (
        <span className="grid grid-cols-2 gap-0.5">
          {shown.map(key => <CategoryBadge key={key} label={COLUMN_BADGE_LABEL[key]} size={14} />)}
          {overflow > 0 && <CategoryOverflowChip count={overflow} size={14} />}
        </span>
      )}
    </button>
  )
}

function DayReviewModal({
  date, entriesByColumn, capacity, phName, approvedRows, pendingRows, maxByColumnKey, maxFullTime, rotationsByDoctorId,
  initialShowRequestForm = false, onDataChanged, onClose,
}) {
  const { user, profile, isAdmin, canSubmitLeave } = useAuth()
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
  const [showRequestForm, setShowRequestForm] = useState(initialShowRequestForm)

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
  const totalCeiling = totalLeaveCeiling(maxFullTime, maxByColumnKey)
  const atFullCapacity = totalSlots >= totalCeiling

  // The top banner personalises to the viewer's own category rather than a
  // flat admin-style headcount — a doctor cares whether *they* could still
  // get leave today, not the generic combined total. myColumnDef is null for
  // a category with no capacity column (Consultant/no profile), which falls
  // back to the old generic "Full" banner below instead. Rendering itself
  // (colours/copy/the generic fallback) lives in LeaveCapacityBanner, shared
  // with LeaveRequestForm's own capacity preview.
  const myColumnKey = resolveLeaveCapacityColumn({ category: profile?.category, contractType: profile?.contract_type, profileId: profile?.id, date, rotationsByDoctorId })
  const myColumnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === myColumnKey)
  const mySlots = myColumnDef ? myCategoryDaySlots(myColumnKey, capacity, maxFullTime) : null

  // One consolidated list instead of a heading per category — an empty
  // category no longer gets a row at all (it was pure visual weight with no
  // information), and individual x/y quotas are gone entirely: with the
  // combined cap now spanning multiple categories at once, a lone column's
  // own headroom doesn't tell a viewer anything reliable about whether they
  // can actually get leave that day.
  const allEntries = visibleColumns.flatMap(col =>
    (entriesByColumn.get(col.key) || []).map(e => ({ ...e, columnKey: col.key, columnLabel: col.label }))
  )

  return (
    <Modal title={formattedDate} onClose={onClose} maxWidthClassName="md:max-w-lg">
      <LeaveCapacityBanner
        mySlots={mySlots}
        columnLabel={myColumnDef?.label}
        pooled={Boolean(myColumnKey) && LEAVE_FULL_TIME_GROUP_KEYS.includes(myColumnKey)}
        atFullCapacity={atFullCapacity}
        dayCapacityState={dayCapacityState}
        totalSlots={totalSlots}
        totalCeiling={totalCeiling}
      />
      {phName && <p className="mt-1 inline-block rounded bg-ink/5 px-2 py-0.5 text-sm font-medium text-ink-light">{phName}</p>}
      {error && <p className="mt-2 text-sm text-flagRed">{error}</p>}

      {showRequestForm ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowRequestForm(false)}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
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
          {allEntries.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">No one is on annual leave today</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-line border-t border-slate-line">
              {allEntries.map(e => (
                <li key={e.profileId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <CategoryBadge label={COLUMN_BADGE_LABEL[e.columnKey]} size={18} />
                    <span className="flex-shrink-0 text-sm font-medium text-ink">{e.surname}</span>
                    <span className="truncate text-xs text-ink-muted">{e.columnLabel} · {formatShortDateRange(e.dateFrom, e.dateTo)}</span>
                  </span>
                  <span className={`flex-shrink-0 text-xs font-medium ${e.status === 'pending' ? 'text-flagAmber' : 'text-success'}`}>
                    {e.status === 'pending' ? 'Pending' : 'Approved'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {isAdmin && pendingRequestsThisDate.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-slate-line pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pending requests</p>
              {pendingRequestsThisDate.map(request => {
                const w = warningsById[request.id]
                const warned = hasWarnings(w)
                const impact = checkApprovalCapacityImpact(
                  request, allRows.filter(r => r.id !== request.id), maxByColumnKey, maxFullTime, rotationsByDoctorId
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
            <>
              {atFullCapacity && (
                <p className="mt-4 text-xs text-ink-muted">
                  This day is already at capacity for annual leave — a request for it will be blocked at submission unless the dates change or an admin frees up a slot.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className={`btn-primary w-full text-sm ${atFullCapacity ? 'mt-2' : 'mt-4'}`}
              >
                Request annual leave for this day
              </button>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
