import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { todayStr } from '../lib/dateRange'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, COLUMN_BADGE_LABEL, LEAVE_CAPACITY_STATES,
  totalLeaveSlotsForDate,
} from '../lib/leaveYearGrid'
import {
  dayEntriesByColumn, dayCapacitySummary, daysWithRoomForCategory, categoryPressureState, myCategoryLegendStates,
} from '../lib/monthWorkspace'
import { daysBySlotsUsed } from '../lib/plannerCalendar'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import CategoryBadge from './CategoryBadge'
import PlannerRequestPanel, { PanelReading, PANEL_RAIL } from './PlannerRequestPanel'
import PlannerToolbar from './PlannerToolbar'
import PlannerCalendarGrid from './PlannerCalendarGrid'
import PlannerDetailsCard from './PlannerDetailsCard'
import CapacityBar from './CapacityBar'
import DayDetails from './annual/DayDetails'
import DateStepper from './DateStepper'
import { LegendIcon } from './PlannerIcons'
import LegendSheet from './LegendSheet'
import LeaveRequestForm from './LeaveRequestForm'
import Modal from './Modal'
import SelectMenu from './SelectMenu'

const GRID_COLUMNS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

// The Annual planner's single-month view — opened from the year overview's
// "Open month" action for whichever month was selected there. Built on the
// blocks every planner month view shares: PlannerToolbar above, the
// Monday-first PlannerCalendarGrid beside a rail holding the request panel
// (month stepper, Showing, the room-for-your-category headline, the
// month's capacity bar, Request annual leave) and the SELECTED DAY card
// (DayDetails: the day's reading, who is on leave, the admin's pending
// review, and the way to ask). On a phone the panel comes first, then the
// toolbar, then the grid, and a tapped day opens DayDetails in a bottom
// sheet instead of the rail card.
//
// Reuses the same year-wide fetch AnnualLeavePlanner.jsx already holds for
// the overview (approvedByDate/pendingByDate/etc.) rather than fetching
// again — this view is just a different lens on the same data, filtered to
// one month by the calendar itself.
export default function MonthWorkspace({
  year, month, onMonthChange, approvedByDate, pendingByDate, pendingRows,
  countByColumnPerDate, publicHolidaysByDate, rotationsByDoctorId, displayNames = new Map(), highlightDate, onHighlightConsumed, maxByColumnKey, maxFullTime, onDataChanged, onBack,
  ruleHintIntro, ruleHintBullets,
}) {
  const { isAdmin, profile } = useAuth()
  // Consultant leave is only ever visible to an admin (or another
  // Consultant — see EC_LEAVE_PLANNER_RULES.md's Consultant privacy rule),
  // so a non-admin viewer shouldn't see the category referenced at all —
  // neither in this legend nor in DayDetails' per-category list (which has
  // its own identical filter off its own useAuth() call).
  const legendColumns = isAdmin ? GRID_COLUMNS : GRID_COLUMNS.filter(col => col.key !== 'Other')

  // First of the month being VIEWED (not today) — an Intern's own column
  // here should reflect whichever rotation covers the month this workspace
  // is currently showing, so browsing into a future/past month with a
  // different rotation reads correctly rather than always showing today's.
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const monthStartDate = `${monthPrefix}-01`
  const myColumnKey = resolveLeaveCapacityColumn({ category: profile?.category, contractType: profile?.contract_type, profileId: profile?.id, date: monthStartDate, rotationsByDoctorId })
  const myColumnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === myColumnKey)
  const mobileLegendStates = !isAdmin && myColumnDef ? myCategoryLegendStates(myColumnKey) : LEAVE_CAPACITY_STATES

  // Which day is selected lives in the URL (`day=YYYY-MM-DD`), not plain
  // useState — same reasoning as AnnualLeavePlanner.jsx's
  // ayear/aview/amonth: a backgrounded mobile browser/PWA can get killed and
  // reloaded by the OS at any time, and the URL is what survives that,
  // reopening this same day's details instead of silently losing it.
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
  const [searchQuery, setSearchQuery] = useState('')

  // highlightDate seeds the initially-selected day (e.g. the Requests
  // queue's "View Calendar" action landing straight on that request's date)
  // — a one-shot: only writes `day` into the URL if nothing's selected yet
  // (a reload with an already-selected day should keep showing that day,
  // not get overridden by a stale highlight prop).
  useEffect(() => {
    if (highlightDate && !selectedDate) setSelectedDate(highlightDate)
    if (highlightDate) onHighlightConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever run once on mount, consuming whatever highlightDate this instance was seeded with
  }, [])

  // The request form, prefilled with a day: from the panel's primary
  // action (today if it falls in the month being viewed, else the 1st, so
  // the date fields still start with something sensible for a future month
  // the doctor is just browsing ahead into) or from the selected day's own
  // "Request leave from this day" / "Submit for admin approval".
  const [requestFormDate, setRequestFormDate] = useState(null)
  function openRequestLeave(date) {
    if (date) { setRequestFormDate(date); return }
    const isCurrentMonth = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7))
    setRequestFormDate(isCurrentMonth ? today : monthStartDate)
  }

  // One cell per day for the shared grid: the day's true combined count
  // (the pips are the same four-state scale for everyone), the public
  // holiday, and the names — read straight off the grid on a desktop,
  // narrowed by the toolbar search. Capacity itself never narrows: a
  // search for one surname still shows every day's real pips.
  const query = searchQuery.trim().toLowerCase()
  const gridCells = new Map()
  const datesWithLeave = new Set([...approvedByDate.keys(), ...pendingByDate.keys()].filter(d => d.startsWith(monthPrefix)))
  for (const date of datesWithLeave) {
    const byColumn = dayEntriesByColumn(date, { approvedByDate, pendingByDate }, rotationsByDoctorId)
    const names = []
    for (const [key, columnEntries] of byColumn) {
      if (!legendColumns.some(c => c.key === key)) continue
      for (const e of columnEntries) {
        const label = displayNames.get(e.profileId) ?? e.surname
        if (query && !label.toLowerCase().includes(query)) continue
        names.push({ key: `${e.profileId}-${e.status}`, label, badge: COLUMN_BADGE_LABEL[key], pending: e.status === 'pending' })
      }
    }
    gridCells.set(date, { used: totalLeaveSlotsForDate(date, countByColumnPerDate), names })
  }
  for (const [date, phName] of publicHolidaysByDate) {
    if (!date.startsWith(monthPrefix)) continue
    gridCells.set(date, { ...(gridCells.get(date) ?? { used: totalLeaveSlotsForDate(date, countByColumnPerDate), names: [] }), isPublicHoliday: true, phName })
  }
  const monthBuckets = daysBySlotsUsed(year, month, d => totalLeaveSlotsForDate(d, countByColumnPerDate))

  const legendSheet = (
    <LegendSheet
      trigger={onClick => (
        <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-utility h-[30px] w-[30px] p-0">
          <LegendIcon className="h-4 w-4" />
        </button>
      )}
      ruleIntro={ruleHintIntro}
      ruleBullets={ruleHintBullets}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-muted">
        {legendColumns.map(col => (
          <span key={col.key} className="flex items-center gap-1.5">
            <CategoryBadge label={COLUMN_BADGE_LABEL[col.key]} size={18} />
            {col.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink/10 ring-1 ring-inset ring-ink-muted" /> Public holiday</span>
      </div>
      {/* Two variants, gated by viewport: the phone cells' pips are the
          generic four-state scale too, but a non-admin's own pool only
          ever reaches three of those states, so the phone legend lists
          just the ones their own room can show. */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted lg:hidden">
        {mobileLegendStates.map(state => (
          <span key={state.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${state.fill}`} /> {state.label}
          </span>
        ))}
      </div>
      <div className="mt-2 hidden flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted lg:flex">
        {LEAVE_CAPACITY_STATES.map(state => (
          <span key={state.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${state.fill}`} /> {state.label}
          </span>
        ))}
      </div>
    </LegendSheet>
  )

  const selectedInMonth = Boolean(selectedDate) && selectedDate.startsWith(monthPrefix)

  return (
    <div>
      {/* One grid, three areas. Desktop: the toolbar spans both columns,
          then the calendar beside the sticky rail. Below lg the same three
          children stack as panel, toolbar, grid (order utilities), with
          the details in a bottom sheet rather than the rail. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="order-2 lg:order-none lg:col-span-2">
          <PlannerToolbar
            onBack={onBack}
            search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search name…' }}
            legend={legendSheet}
            middle={<CapacityKey />}
          />
        </div>

        <div className="order-3 min-w-0 lg:order-none">
          <PlannerCalendarGrid
            year={year}
            month={month}
            cells={gridCells}
            selectedDate={selectedDate}
            today={today}
            onSelect={setSelectedDate}
          />
        </div>

        <div className={`order-1 lg:order-none ${PANEL_RAIL}`}>
          <YourLeaveCard
            profile={profile}
            year={year}
            month={month}
            onMonthChange={onMonthChange}
            maxByColumnKey={maxByColumnKey}
            maxFullTime={maxFullTime}
            countByColumnPerDate={countByColumnPerDate}
            rotationsByDoctorId={rotationsByDoctorId}
            monthBuckets={monthBuckets}
            onRequestLeave={() => openRequestLeave()}
          />
          <PlannerDetailsCard
            className="mt-3"
            eyebrow="Selected day"
            emptyMessage="Select a day to see details."
            open={selectedInMonth}
            onClose={() => setSelectedDate(null)}
          >
            {selectedInMonth && (
              <DayDetails
                key={selectedDate}
                date={selectedDate}
                entriesByColumn={dayEntriesByColumn(selectedDate, { approvedByDate, pendingByDate }, rotationsByDoctorId)}
                capacity={dayCapacitySummary(selectedDate, countByColumnPerDate, maxByColumnKey)}
                phName={publicHolidaysByDate.get(selectedDate)}
                displayNames={displayNames}
                pendingRows={pendingRows}
                maxByColumnKey={maxByColumnKey}
                maxFullTime={maxFullTime}
                rotationsByDoctorId={rotationsByDoctorId}
                onDataChanged={onDataChanged}
                onRequestLeave={openRequestLeave}
              />
            )}
          </PlannerDetailsCard>
        </div>
      </div>

      {requestFormDate && (
        <Modal title="Request annual leave" onClose={() => setRequestFormDate(null)} centered>
          <LeaveRequestForm
            initialDateFrom={requestFormDate}
            initialDateTo={requestFormDate}
            onSubmitted={() => { setRequestFormDate(null); onDataChanged() }}
          />
        </Modal>
      )}
    </div>
  )
}

// The toolbar's middle slot on a desktop: the four-state capacity key the
// pips use, inline, so the grid never needs a sheet opened to be read.
function CapacityKey() {
  return (
    <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted md:flex" data-testid="capacity-key">
      {LEAVE_CAPACITY_STATES.map((state, i) => (
        <span key={state.key} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-[3px] ${state.fill}`} /> {i === 3 ? '3+' : i} used
        </span>
      ))}
    </div>
  )
}

// The month view's request panel: the month stepper (this view's one
// period control), "Showing" — for a viewer whose category has a capacity
// column, which column's room the headline reads — the headline itself
// ("N of M days have room for your category", respecting BOTH the
// per-category and the combined cap via daysWithRoomForCategory), the
// month's capacity bar, and the one filled button on the page. A viewer
// with no column (Consultant, admin, no profile) gets the stepper and the
// bar alone — there's nothing to personalise for them.
//
// The picker opens on the viewer's own column and lets them preview a
// DIFFERENT column's room for this same month — useful for an Intern
// browsing ahead into a month they expect to be on a different EC/OT
// rotation for, without waiting for their intern_rotations row to be
// updated first. Purely a display override: it doesn't change which pool a
// submitted request actually lands in (that's always resolved fresh off the
// real profile/rotation at submission time — see resolveLeaveCapacityColumn)
// — a note below makes that explicit whenever an override is active, and it
// resets on every month change so a stale "previewing OT" state can't
// silently follow the viewer around.
function YourLeaveCard({ profile, year, month, onMonthChange, maxByColumnKey, maxFullTime, countByColumnPerDate, rotationsByDoctorId, monthBuckets, onRequestLeave }) {
  const monthStartDate = `${year}-${String(month).padStart(2, '0')}-01`
  const myColumnKey = resolveLeaveCapacityColumn({ category: profile?.category, contractType: profile?.contract_type, profileId: profile?.id, date: monthStartDate, rotationsByDoctorId })
  const myColumnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === myColumnKey)
  const [overrideColumnKey, setOverrideColumnKey] = useState(null)
  useEffect(() => { setOverrideColumnKey(null) }, [year, month])

  const columnKey = overrideColumnKey ?? myColumnKey
  const columnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === columnKey) ?? myColumnDef
  const isOverridden = Boolean(overrideColumnKey) && overrideColumnKey !== myColumnKey

  const stat = myColumnDef ? daysWithRoomForCategory(year, month, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDate) : null
  const state = myColumnDef ? categoryPressureState(year, month, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDate) : null

  return (
    <PlannerRequestPanel
      eyebrow="Annual leave · Month"
      stepper={<DateStepper unit="month" year={year} month={month} onChange={onMonthChange} showToday={false} centered />}
      headline={stat && state && (
        <PanelReading
          value={stat.withRoom}
          valueClassName={state.text}
          unit={`of ${stat.total} days have room for ${isOverridden ? 'that' : 'your'} category`}
        />
      )}
      capacityBar={<CapacityBar buckets={monthBuckets} />}
      // Says which leave, now that the same page can also lead to a special
      // leave request: "Request leave" alone doesn't say which kind.
      actionLabel="Request annual leave"
      onAction={onRequestLeave}
    >
      {myColumnDef && (
        <>
          <label htmlFor="annual-capacity-month" className="mt-2 block text-[11px] font-semibold text-ink-muted">Showing</label>
          <div className="mt-1">
            <SelectMenu
              id="annual-capacity-month"
              value={columnKey}
              onChange={v => setOverrideColumnKey(v === myColumnKey ? null : v)}
              options={LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label }))}
            />
          </div>
          {isOverridden && (
            <p className="mt-1 text-[10px] text-ink-muted">
              Previewing {columnDef.label} — your own category is {myColumnDef.label}. Submitting still counts against your real category.{' '}
              <button type="button" onClick={() => setOverrideColumnKey(null)} className="underline">Reset</button>
            </p>
          )}
        </>
      )}
    </PlannerRequestPanel>
  )
}
