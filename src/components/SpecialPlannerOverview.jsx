import { useState } from 'react'
import Modal from './Modal'
import PlannerRequestPanel, { PANEL_RAIL } from './PlannerRequestPanel'
import LeaveRequestForm from './LeaveRequestForm'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import SelectMenu from './SelectMenu'
import { monthsForYear, LEAVE_CAPACITY_STATES } from '../lib/leaveYearGrid'
import { SPECIAL_LEAVE_SOFT_CAP } from '../lib/leaveRequests'
import { todayStr } from '../lib/dateRange'
import { daysBySlotsUsed } from '../lib/plannerCalendar'
import {
  specialCountsByDate, specialMonthMarkers, leadingBlanksForMonth, specialMonthStats, specialMonthEntries,
  SPECIAL_CATEGORY_FILTER_OPTIONS as CATEGORY_FILTER_OPTIONS, defaultSpecialCategoryKey as defaultCategoryKey, matchesSpecialCategory as matchesCategory,
} from '../lib/specialPlanner'
import DateStepper from './DateStepper'
import PlannerDetailsCard from './PlannerDetailsCard'
import SpecialMonthSummary from './special/SpecialMonthSummary'
import LegendSheet from './LegendSheet'
import { LegendIcon } from './PlannerIcons'

// The Special planner's 12-month landing view — the direct counterpart of
// AnnualPlannerOverview, deliberately the same shape (toolbar, 3x4 month
// grid, sticky inspector rail) so the two planner tabs read as one system
// rather than two unrelated screens. It replaces the year-long day-row
// spreadsheet this tab used to show on desktop, which shared nothing with
// the Annual planner beyond the data behind it.
//
// The one real difference is what the colours mean. Annual has enforced
// per-category caps; special leave has only the EC Leave Planner sheet's
// documented guideline of no more than SPECIAL_LEAVE_SOFT_CAP doctors at
// once. So the day cells read as pressure against that guideline, using
// Annual's own capacityStateForCount (which clamps at 3) so an identical
// headcount is an identical colour on both tabs.
export default function SpecialPlannerOverview({
  year, onYearChange, leaveByDate, displayNames = new Map(), publicHolidaysByDate = new Map(),
  rotationsByDoctorId = new Map(), myCategory, myContractType,
  onOpenWorkspace, ruleIntro, ruleBullets, onRequestSubmitted,
}) {
  const { isAdmin } = useAuth()
  const [requestOpen, setRequestOpen] = useState(false)
  const today = todayStr()
  const todayYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(todayYear === year ? currentMonth : 1)
  const [categoryKey, setCategoryKey] = useState(() => defaultCategoryKey(myCategory, myContractType))

  const countsByDate = specialCountsByDate(leaveByDate)
  const monthCards = monthsForYear(year).map(m => {
    const markers = specialMonthMarkers(m.year, m.month, countsByDate, publicHolidaysByDate)
    const stats = specialMonthStats(m.year, m.month, leaveByDate, countsByDate)
    return { ...m, markers, stats }
  })

  const selected = monthCards[selectedMonth - 1]
  const selectedEntries = specialMonthEntries(year, selectedMonth, leaveByDate)
  const selectedBuckets = daysBySlotsUsed(year, selectedMonth, d => countsByDate.get(d) || 0, { max: SPECIAL_LEAVE_SOFT_CAP })

  // The month tiles and cards, read through the Showing picker. The day
  // bars and the state chip stay on the TRUE shared count — special
  // leave's guideline is 3 doctors of any category (SPECIAL_LEAVE_SOFT_CAP),
  // so unlike Annual there is no per-category capacity to filter and
  // colouring a filtered subset would read as "my category has room" when
  // the shared pool is already full. The picker filters WHO each tile or
  // card counts (people, pending), not what the colours mean.
  const filteredMonthCards = monthCards.map(m => {
    const entries = specialMonthEntries(year, m.month, leaveByDate)
      .filter(e => matchesCategory(e, categoryKey, rotationsByDoctorId))
    const worstState = m.markers.reduce(
      (worst, d) => LEAVE_CAPACITY_STATES.indexOf(d.capacityState) > LEAVE_CAPACITY_STATES.indexOf(worst) ? d.capacityState : worst,
      LEAVE_CAPACITY_STATES[0]
    )
    return {
      ...m, worstState,
      people: new Set(entries.map(e => e.profileId)).size,
      pending: entries.filter(e => e.status === 'pending').length,
    }
  })
  // Only the browsed year's own relationship to today matters — a past year
  // has no current/coming month, a future year no current/previous. Same
  // split as AnnualPlannerOverview's.
  const currentMonthCard = todayYear === year ? filteredMonthCards.find(m => m.month === currentMonth) : null
  const comingMonthCards = todayYear === year
    ? filteredMonthCards.filter(m => m.month > currentMonth)
    : year > todayYear ? filteredMonthCards : []
  const previousMonthCards = todayYear === year
    ? filteredMonthCards.filter(m => m.month < currentMonth)
    : year < todayYear ? filteredMonthCards : []

  // The same request panel the Annual and Weekend planners lead with, on
  // every viewport: the eyebrow names the planner and view, the year
  // stepper under it is the page's only period control, then the picker and
  // the request action. "Showing", not Annual's "Showing capacity for":
  // special leave has one shared 3-doctor guideline rather than a cap per
  // category, so this narrows who you're looking at — it can't narrow the
  // capacity, which is the same number for everyone. `id` differs per
  // viewport: both copies are in the document at once in jsdom and at a
  // breakpoint boundary, and two controls can't share one id.
  function renderRequestPanel(id) {
    return (
      <PlannerRequestPanel
        eyebrow="Special leave · Overview"
        stepper={<DateStepper unit="year" year={year} onChange={onYearChange} showToday={false} centered />}
        actionLabel="Request special leave"
        onAction={() => setRequestOpen(true)}
      >
        <label htmlFor={id} className="mt-2 block text-[11px] font-semibold text-ink-muted">Showing</label>
        <div className="mt-1">
          <SelectMenu id={id} value={categoryKey} onChange={setCategoryKey} options={CATEGORY_FILTER_OPTIONS} />
        </div>
      </PlannerRequestPanel>
    )
  }

  return (
    <div>
      {/* ── Non-admin mobile: the same month-finder shape the Annual tab
          uses, so the two planner tabs read as one system — year stepper,
          a category picker, then the months split by time rather than a
          12-card grid a doctor has to scan. Admins keep the departmental
          dashboard on every viewport (cross-category exception management,
          where a filter would hide the very overlaps they need to see), and
          it remains on desktop for everyone. ── */}
      {!isAdmin && (
        <div data-testid="special-month-finder" className="lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">Special Leave Planner</h2>
            <SpecialLegendTrigger ruleIntro={ruleIntro} ruleBullets={ruleBullets} />
          </div>

          {/* Above the months, not beside the title: it changes what every
              tile below counts, so it reads as the heading for the list. */}
          <div className="mt-3">{renderRequestPanel('special-scope-mobile')}</div>

          {currentMonthCard && (
            <div className="mt-4">
              <p className="sheen-divider">Current month</p>
              <div className="mt-2 space-y-2">
                <SpecialMonthTile month={currentMonthCard} categoryKey={categoryKey} onOpen={() => onOpenWorkspace(currentMonthCard.month)} />
              </div>
            </div>
          )}

          {comingMonthCards.length > 0 && (
            <div className="mt-4">
              <p className="sheen-divider">Coming months</p>
              <div className="mt-2 space-y-2">
                {comingMonthCards.map(m => (
                  <SpecialMonthTile key={m.month} month={m} categoryKey={categoryKey} onOpen={() => onOpenWorkspace(m.month)} />
                ))}
              </div>
            </div>
          )}

          {previousMonthCards.length > 0 && (
            <div className="mt-4">
              <p className="sheen-divider">Previous months</p>
              <div className="mt-2 space-y-2">
                {previousMonthCards.map(m => (
                  <SpecialMonthTile key={m.month} month={m} categoryKey={categoryKey} onOpen={() => onOpenWorkspace(m.month)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={isAdmin ? '' : 'hidden lg:block'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Special Leave Planner</h2>
        <SpecialLegendTrigger ruleIntro={ruleIntro} ruleBullets={ruleBullets} />
      </div>

      {/* Mobile (<lg, admins only — doctors get the finder above): stacked,
          rail first so the request panel and the selected month's detail
          are readable without scrolling past the whole grid. Desktop
          (lg+): grid and sticky rail side by side — request panel on top,
          Selected month inspector under it. Same split
          AnnualPlannerOverview uses. */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div data-testid="special-year-grid" className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 lg:grid-cols-3">
          {filteredMonthCards.map(m => (
            <MonthCard
              key={m.month}
              month={m}
              isSelected={m.month === selectedMonth}
              // Clicking an unselected month selects it; clicking the
              // already-selected one opens it — a second click on the same
              // card reads as "open this", not "select this again".
              onSelect={() => m.month === selectedMonth ? onOpenWorkspace(m.month) : setSelectedMonth(m.month)}
            />
          ))}
        </div>

        <div className={PANEL_RAIL}>
        {renderRequestPanel('special-scope-desktop')}
        {/* SELECTED MONTH: the card's title is the month the grid has
            selected — the year stepper in the panel above is this view's
            only period control, so no second stepper here. */}
        <div data-testid="special-inspector" className="mt-3">
          <PlannerDetailsCard eyebrow="Selected month" title={`${selected.label} ${year}`}>
            <SpecialMonthSummary
              stats={selected.stats}
              buckets={selectedBuckets}
              totalDays={selected.markers.length}
              entries={selectedEntries}
              displayNames={displayNames}
              isAdmin={isAdmin}
              onOpenMonth={() => onOpenWorkspace(selectedMonth)}
              requestsHref="/leave?tab=requests&from=special"
            />
          </PlannerDetailsCard>
        </div>
        </div>
      </div>
      </div>

      {requestOpen && (
        <Modal title="Request special leave" onClose={() => setRequestOpen(false)} centered>
          <LeaveRequestForm initialLeaveType="special_leave" onSubmitted={() => { setRequestOpen(false); onRequestSubmitted?.() }} />
        </Modal>
      )}
    </div>
  )
}

// One month as a single row: name, a chip for the worst shared-capacity day
// in it, and a strip of one bar per day. The bars are the whole point —
// they answer "which part of this month is busy" at a glance without
// opening it, which a 12-card mini-calendar grid can't do on a phone.
function SpecialMonthTile({ month, categoryKey, onOpen }) {
  const who = categoryKey === 'all'
    ? `${month.people} ${month.people === 1 ? 'person' : 'people'} on leave`
    : `${month.people} on leave`
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-sm font-semibold text-ink">{month.label}</span>
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${month.worstState.tint} ${month.worstState.text}`}>
            {chipLabelForMonth(month)}
          </span>
        </div>
        <div className="mt-2 flex gap-[2px]">
          {month.markers.map(d => (
            <span
              key={d.date}
              className={`h-1.5 flex-1 rounded-sm ${d.capacityState.fill}`}
              title={d.publicHolidayName || `${d.count} on special leave`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">{month.people === 0 ? 'Nobody on leave' : who}</p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
    </button>
  )
}

// Days, not just a state name: "Limited" alone doesn't say whether that's
// one awkward day or half the month. Same wording the Annual planner's own
// month tiles use (chipLabelForMonth there), so a chip means the same thing
// on both tabs — with one state Annual can't reach: special leave has no
// enforced cap, so a day CAN go past the 3-doctor guideline, and "No
// capacity" would understate a day that is already over it.
function chipLabelForMonth(month) {
  const days = key => month.markers.filter(d => d.capacityState.key === key).length
  const overGuideline = month.markers.filter(d => d.count > SPECIAL_LEAVE_SOFT_CAP).length
  if (overGuideline > 0) return `Capacity exceeded on ${dayCount(overGuideline)}`
  if (month.worstState.key === 'at_capacity') return `No capacity on ${dayCount(days('at_capacity'))}`
  if (month.worstState.key === 'near_capacity') return `Near capacity on ${dayCount(days('near_capacity'))}`
  if (month.worstState.key === 'limited') return `Limited capacity on ${dayCount(days('limited'))}`
  return month.worstState.label // "Available" — nothing to quantify
}

function dayCount(days) {
  return `${days} day${days === 1 ? '' : 's'}`
}

// Same trigger the Annual planner uses, and the same single entry point to
// both the colour key and the rules (see LegendSheet).
export function SpecialLegendTrigger({ ruleIntro, ruleBullets }) {
  return (
    <LegendSheet
      ruleIntro={ruleIntro}
      ruleBullets={ruleBullets}
      trigger={onClick => (
        <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-utility h-[30px] w-[30px] p-0">
          <LegendIcon className="h-4 w-4" />
        </button>
      )}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-muted">
        {/* Annual's state names, with the slot count each one stands for —
            the names are what a doctor reads on both tabs, and the count is
            what makes them concrete here, where the "cap" is one shared
            guideline of SPECIAL_LEAVE_SOFT_CAP rather than a per-category
            quota. The last state covers 3/3 and anything past it, since
            nothing stops a day going over. */}
        {LEAVE_CAPACITY_STATES.map((state, i) => (
          <span key={state.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${state.fill}`} />
            {i >= SPECIAL_LEAVE_SOFT_CAP
              ? `${state.label} (${SPECIAL_LEAVE_SOFT_CAP}/${SPECIAL_LEAVE_SOFT_CAP} or more)`
              : `${state.label} (${i}/${SPECIAL_LEAVE_SOFT_CAP})`}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink/10 ring-1 ring-inset ring-ink-muted" /> Public holiday</span>
      </div>
    </LegendSheet>
  )
}

// One month at a glance: label, a one-line summary, and a Monday-start
// mini-calendar coloured by how many doctors are on special leave each
// day. Same card shape as AnnualPlannerOverview's MonthCard. The summary
// counts whoever the Showing picker has narrowed to (month.people /
// month.pending, from filteredMonthCards); the cells stay on the true
// shared count, as the mobile tiles' bars do.
function MonthCard({ month, isSelected, onSelect }) {
  const cells = [...Array(leadingBlanksForMonth(month.markers)).fill(null), ...month.markers]
  const summary = month.people === 0
    ? 'Nobody on leave'
    : `${month.people} ${month.people === 1 ? 'person' : 'people'} · ${month.pending} pending`

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`card p-3 text-left transition-colors ${isSelected ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/40'}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-semibold text-ink">{month.label}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">{summary}</p>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} className="h-3.5 w-3.5" />
          // A public holiday keeps its pressure fill and gains a ring in a
          // darker shade of the same colour, rather than swapping to a flat
          // block that would hide the count — same treatment as Annual's.
          const phRing = day.isPublicHoliday ? `ring-1 ring-inset ${day.capacityState.ringDark}` : ''
          return (
            <span key={day.date} className="h-3.5 w-3.5" title={day.publicHolidayName || `${day.count} on special leave`}>
              <span className={`block h-3.5 w-3.5 rounded-sm ${day.capacityState.fill} ${phRing}`} />
            </span>
          )
        })}
      </div>
    </button>
  )
}
