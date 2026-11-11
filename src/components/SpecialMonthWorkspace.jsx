import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { COLUMN_BADGE_LABEL, LEAVE_OTHER_COLUMN, LEAVE_CAPACITY_COLUMNS, LEAVE_CAPACITY_STATES } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn } from '../lib/internRotations'
import { SPECIAL_LEAVE_SOFT_CAP } from '../lib/leaveRequests'
import { todayStr } from '../lib/dateRange'
import { daysBySlotsUsed } from '../lib/plannerCalendar'
import {
  specialCountsByDate, specialMonthMarkers, specialCapacityBarLabels, SPECIAL_CATEGORY_FILTER_OPTIONS, matchesSpecialCategory, defaultSpecialCategoryKey,
} from '../lib/specialPlanner'
import { useAuth } from '../context/AuthContext'
import DateStepper from './DateStepper'
import Modal from './Modal'
import PlannerRequestPanel, { PanelReading, PANEL_RAIL } from './PlannerRequestPanel'
import PlannerToolbar from './PlannerToolbar'
import PlannerCalendarGrid from './PlannerCalendarGrid'
import PlannerDetailsCard from './PlannerDetailsCard'
import CapacityBar from './CapacityBar'
import LeaveRequestForm from './LeaveRequestForm'
import SelectMenu from './SelectMenu'
import SpecialDayDetails from './special/SpecialDayDetails'
import { SpecialLegendTrigger } from './SpecialPlannerOverview'

const GRID_COLUMNS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

// The Special planner's single-month view, on the same blocks as the
// Annual month view (MonthWorkspace): PlannerToolbar above, the
// Monday-first PlannerCalendarGrid beside a rail holding the request panel
// (month stepper, Showing, the days-with-room headline, the month's
// guideline bar, Request special leave) and the SELECTED DAY card. On a
// phone the panel comes first, then the toolbar, then the grid, and a
// tapped day opens SpecialDayDetails in a bottom sheet.
//
// What differs from Annual is only what the numbers mean: special leave
// has no enforced cap, just the EC Leave Planner sheet's guideline of
// SPECIAL_LEAVE_SOFT_CAP doctors at once, so the pips, bar and day reading
// are worded as "on special leave" against a guideline, and the day's
// request action is always offered. Approving lives in Planners →
// Requests, so the day card is read-only apart from that action.
export default function SpecialMonthWorkspace({
  year, month, onMonthChange, leaveByDate, displayNames = new Map(), publicHolidaysByDate = new Map(),
  rotationsByDoctorId, onBack, onDataChanged, ruleIntro, ruleBullets,
}) {
  const { isAdmin, profile } = useAuth()
  // Consultant leave is admin-only (EC_LEAVE_PLANNER_RULES.md's Consultant
  // privacy rule) — filtered here as well as in the day card, so a
  // non-admin never sees it in a grid cell either.
  const visibleKeys = new Set(
    (isAdmin ? GRID_COLUMNS : GRID_COLUMNS.filter(c => c.key !== LEAVE_OTHER_COLUMN.key)).map(c => c.key)
  )

  // The selected day lives in the URL (`sday=YYYY-MM-DD`) for the same
  // reason the planner's own syear/sview/smonth do: a backgrounded phone
  // browser can reload the page at any time, and the URL survives that.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDate = searchParams.get('sday')
  function setSelectedDate(date) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (date) next.set('sday', date)
      else next.delete('sday')
      return next
    }, { replace: true })
  }

  // The Showing picker opens on the viewer's own group, as the overview's
  // does. It narrows WHO the cells list, never what the pips show — the
  // count is the true shared one against the 3-doctor guideline, and the
  // day card a tap opens is always unfiltered.
  const [categoryKey, setCategoryKey] = useState(() => defaultSpecialCategoryKey(profile?.category, profile?.contract_type))
  const [searchQuery, setSearchQuery] = useState('')
  const [requestFormDate, setRequestFormDate] = useState(null)

  const today = todayStr()
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const monthStartDate = `${monthPrefix}-01`
  const countsByDate = specialCountsByDate(leaveByDate)
  const monthMarkers = specialMonthMarkers(year, month, countsByDate, publicHolidaysByDate)
  const daysWithRoom = monthMarkers.filter(m => m.count < SPECIAL_LEAVE_SOFT_CAP).length
  const monthBuckets = daysBySlotsUsed(year, month, d => countsByDate.get(d) || 0, { max: SPECIAL_LEAVE_SOFT_CAP })

  // Today when today is in the month being viewed, else the 1st — so a
  // doctor browsing ahead still lands on a sensible date.
  function openRequestLeave(date) {
    if (date) { setRequestFormDate(date); return }
    const isCurrentMonth = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7))
    setRequestFormDate(isCurrentMonth ? today : monthStartDate)
  }

  function rowsForDate(date) {
    return (leaveByDate.get(date) || [])
      .map(entry => {
        const key = resolveLeaveCapacityColumn({
          category: entry.category, profileId: entry.profileId, date: entry.dateFrom, rotationsByDoctorId,
        }) ?? LEAVE_OTHER_COLUMN.key
        const column = GRID_COLUMNS.find(c => c.key === key) ?? LEAVE_OTHER_COLUMN
        return { ...entry, columnKey: key, columnLabel: column.label }
      })
      .filter(row => visibleKeys.has(row.columnKey))
  }

  // One cell per day for the shared grid: the day's true count, the public
  // holiday, and the names narrowed by the Showing picker and the toolbar
  // search. Capacity never narrows with either.
  const query = searchQuery.trim().toLowerCase()
  const gridCells = new Map()
  for (const marker of monthMarkers) {
    const names = rowsForDate(marker.date)
      .filter(row => matchesSpecialCategory(row, categoryKey, rotationsByDoctorId))
      .map(e => ({ key: `${e.profileId}-${e.leaveType}-${e.dateFrom}`, label: displayNames.get(e.profileId) ?? e.surname, badge: COLUMN_BADGE_LABEL[e.columnKey], pending: e.status === 'pending' }))
      .filter(n => !query || n.label.toLowerCase().includes(query))
    if (marker.count === 0 && names.length === 0 && !marker.isPublicHoliday) continue
    gridCells.set(marker.date, { used: marker.count, names, isPublicHoliday: marker.isPublicHoliday, phName: marker.publicHolidayName })
  }

  const selectedInMonth = Boolean(selectedDate) && selectedDate.startsWith(monthPrefix)

  return (
    <div>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="order-2 lg:order-none lg:col-span-2">
          <PlannerToolbar
            onBack={onBack}
            search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search name…' }}
            legend={<SpecialLegendTrigger ruleIntro={ruleIntro} ruleBullets={ruleBullets} />}
            middle={<GuidelineKey />}
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
            max={SPECIAL_LEAVE_SOFT_CAP}
            pipLabel={used => `${used} of ${SPECIAL_LEAVE_SOFT_CAP} on special leave`}
          />
        </div>

        <div className={`order-1 lg:order-none ${PANEL_RAIL}`}>
          <PlannerRequestPanel
            eyebrow="Special leave · Month"
            stepper={<DateStepper unit="month" year={year} month={month} onChange={onMonthChange} showToday={false} centered />}
            headline={(
              <PanelReading
                value={daysWithRoom}
                valueClassName={daysWithRoom === monthMarkers.length ? 'text-capAvailable-ink' : daysWithRoom === 0 ? 'text-capAtCapacity-ink' : 'text-capNear-ink'}
                unit={`of ${monthMarkers.length} days have room`}
              />
            )}
            capacityBar={<CapacityBar buckets={monthBuckets} labels={specialCapacityBarLabels()} max={SPECIAL_LEAVE_SOFT_CAP} />}
            actionLabel="Request special leave"
            onAction={() => openRequestLeave()}
          >
            <label htmlFor="special-scope-month" className="mt-2 block text-[11px] font-semibold text-ink-muted">Showing</label>
            <div className="mt-1">
              <SelectMenu id="special-scope-month" value={categoryKey} onChange={setCategoryKey} options={SPECIAL_CATEGORY_FILTER_OPTIONS} />
            </div>
          </PlannerRequestPanel>

          <PlannerDetailsCard
            className="mt-3"
            eyebrow="Selected day"
            emptyMessage="Select a day to see details."
            open={selectedInMonth}
            onClose={() => setSelectedDate(null)}
          >
            {selectedInMonth && (
              <SpecialDayDetails
                key={selectedDate}
                date={selectedDate}
                rows={rowsForDate(selectedDate)}
                count={countsByDate.get(selectedDate) || 0}
                phName={publicHolidaysByDate.get(selectedDate)}
                displayNames={displayNames}
                onRequestLeave={openRequestLeave}
              />
            )}
          </PlannerDetailsCard>
        </div>
      </div>

      {requestFormDate && (
        <Modal title="Request special leave" onClose={() => setRequestFormDate(null)} centered>
          <LeaveRequestForm
            initialDateFrom={requestFormDate}
            initialDateTo={requestFormDate}
            // Opened from the Special tab, so the type leads with Special
            // leave — still a plain dropdown the requester can change.
            initialLeaveType="special_leave"
            onSubmitted={() => { setRequestFormDate(null); onDataChanged?.() }}
          />
        </Modal>
      )}
    </div>
  )
}

// The toolbar's middle slot on a desktop: the pips' four-state key, worded
// for the guideline rather than slots.
function GuidelineKey() {
  return (
    <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted md:flex" data-testid="guideline-key">
      {LEAVE_CAPACITY_STATES.map((state, i) => (
        <span key={state.key} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-[3px] ${state.fill}`} /> {i === LEAVE_CAPACITY_STATES.length - 1 ? `${SPECIAL_LEAVE_SOFT_CAP}+` : i} on leave
        </span>
      ))}
    </div>
  )
}
