import { useState } from 'react'
import { ChevronRight, ExternalLink } from 'lucide-react'
import { monthsForYear } from '../lib/leaveYearGrid'
import { todayStr, parseLocalDate } from '../lib/dateRange'
import {
  saturdaysInMonth, isProfileAssignedToWeekend, weekendExceptionRequestsBySaturday,
  weekendCoverageSummary, weekendHealthState, nextSaturdayToRequestOff, WEEKEND_RULE_BULLETS,
} from '../lib/weekendPlanner'
import { addDays } from '../lib/dateRange'
import DateStepper from './DateStepper'
import LeaveRequestForm from './LeaveRequestForm'
import Modal from './Modal'
import PlannerRequestPanel, { PANEL_DESKTOP_WIDTH } from './PlannerRequestPanel'
import LegendSheet from './LegendSheet'
import SelectMenu from './SelectMenu'
import { LegendIcon, TodayIcon } from './PlannerIcons'

// A genuinely different read of the same weekend_planner_entries +
// weekend_exception leave_requests data WeekendYearOverview.jsx uses — this
// is "am I on this weekend" (working/off/pending exception) for the
// signed-in doctor, not staffing completeness, so it's kept local to this
// component rather than shared with weekendYearOverview.js's admin-facing
// helpers.
function monthPersonalMarkers(year, month, byWeekend, profileId, requestsBySaturday) {
  return saturdaysInMonth(year, month).map(saturday => {
    const working = isProfileAssignedToWeekend(byWeekend.get(saturday), profileId)
    const request = requestsBySaturday.get(saturday)
    // The block colour answers "am I on this weekend", so an assignment
    // still standing outranks a request against it — but requestStatus is
    // carried alongside regardless, because the request counts are a
    // separate question ("what have I asked for") and must not silently
    // drop a request on a weekend the roster hasn't been redrawn for yet.
    const state = working ? 'working'
      : request?.status === 'approved' ? 'approvedOff'
      : request?.status === 'pending' ? 'pending'
      : 'off'
    return { saturday, state, requestStatus: request?.status ?? null }
  })
}

// The department's read of the same months, for the finder's All weekends
// scope: who is on each weekend rather than whether the viewer is. Same
// green/amber/red staffing states the admin year overview uses (see
// weekendHealthState), because "all weekends" is that question, and a
// personal working/off palette can't answer it.
function monthStaffingMarkers(year, month, byWeekend) {
  return saturdaysInMonth(year, month).map(saturday => {
    const bySaturday = byWeekend.get(saturday)
    const { filledGroups, totalGroups } = weekendCoverageSummary(bySaturday)
    return { saturday, state: weekendHealthState(bySaturday), filledGroups, totalGroups }
  })
}

// Working / pending / approved counts for one month's markers — the numbers
// the Selected month panel and each month tile both report.
function monthTotals(markers) {
  return {
    working: markers.filter(m => m.state === 'working').length,
    pending: markers.filter(m => m.requestStatus === 'pending').length,
    approved: markers.filter(m => m.requestStatus === 'approved').length,
  }
}

// Uses accent (not the flagRed/flagAmber/success roster-state read
// WeekendYearOverview.jsx uses) — "am I working" isn't a staffing-health
// signal, it's the same personal-presence read the rest of the app already
// gives accent. Exception pending stays flagAmber (a genuine roster-state
// flag: this weekend's plan is still unsettled), and off is a neutral
// canvas tone rather than any status colour at all.
const SCOPE_OPTIONS = [
  { value: 'mine', label: 'My weekends' },
  { value: 'all', label: 'All weekends' },
]

// `square` is the block fill on the desktop month cards, `swatch` the
// smaller solid dot the finder rows and the legend use — the same two-tone
// split STATE_STYLE has, and its absence here is what left the All weekends
// cards rendering twelve blank cards: the cards read `square`, which only
// the personal states had.
const HEALTH_STYLE = {
  green: { square: 'bg-success-bg', swatch: 'bg-success', label: 'Fully planned' },
  amber: { square: 'bg-flagAmber-bg', swatch: 'bg-flagAmber', label: 'Needs staff' },
  red: { square: 'bg-flagRed-bg', swatch: 'bg-flagRed', label: 'Empty' },
}

const STATE_STYLE = {
  working: { square: 'bg-accent-tint', swatch: 'bg-accent', label: 'Working' },
  pending: { square: 'bg-flagAmber-bg', swatch: 'bg-flagAmber', label: 'Weekend off pending' },
  // Approved is a settled roster state, the resolved half of the same
  // pending flag above — success, the same pairing every other request read
  // in the app uses, rather than a fourth neutral tone that would leave
  // "approved" looking indistinguishable from "never asked".
  approvedOff: { square: 'bg-success-bg', swatch: 'bg-success', label: 'Weekend off approved' },
  off: { square: 'bg-canvas-sunken', swatch: 'bg-canvas-sunken', label: 'Off' },
}

function formatShortDate(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// The Weekend Planner's year-overview landing page for a doctor — same
// shell as WeekendYearOverview.jsx (toolbar, legend, 3x4 month grid, sticky
// inspector, tap-a-month → "Open month" flow) but reading "am I on this
// weekend" instead of staffing completeness, and with no admin-only stats.
export default function MyWeekendYearOverview({ year, onYearChange, byWeekend, myRequests, myProfileId, initialScope, onScopeChange, onOpenMonth, onDataChanged }) {
  const today = todayStr()
  const todayYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const [selectedMonth, setSelectedMonth] = useState(todayYear === year ? currentMonth : 1)
  // Which read the month finder gives: the viewer's own weekends, or the
  // whole department's. Seeded from whatever scope the planner is already
  // showing (the month view's own filter chips write to the same place), so
  // coming back from a month doesn't reset it. Anything that isn't "all" —
  // including the month view's My requests/Needs planning chips, which have
  // no counterpart here — reads as personal. Personal is also the default:
  // it's what a doctor opens this page for. The desktop grid below stays
  // personal either way.
  const [scope, setScopeState] = useState(initialScope === 'all' ? 'all' : 'mine')
  function setScope(next) {
    setScopeState(next)
    onScopeChange?.(next)
  }
  const requestsBySaturday = weekendExceptionRequestsBySaturday(myRequests)

  const months = monthsForYear(year)
  const monthCards = months.map(m => ({
    ...m,
    markers: monthPersonalMarkers(m.year, m.month, byWeekend, myProfileId, requestsBySaturday),
    staffingMarkers: monthStaffingMarkers(m.year, m.month, byWeekend),
  }))

  const selectedTotals = monthTotals(monthCards[selectedMonth - 1].markers)

  // Current month first, then the rest of the year, then what's already
  // been and gone — the same split the Annual and Special planners' mobile
  // month finders use. Only the browsed year's own relationship to today
  // matters: a past year has no current/coming month, a future one no
  // current/previous.
  const currentMonthCard = todayYear === year ? monthCards.find(m => m.month === currentMonth) : null
  const comingMonthCards = todayYear === year
    ? monthCards.filter(m => m.month > currentMonth)
    : year > todayYear ? monthCards : []
  const previousMonthCards = todayYear === year
    ? monthCards.filter(m => m.month < currentMonth)
    : year < todayYear ? monthCards : []

  // The page's own Today, not DateStepper's own built-in one (suppressed
  // below via showToday={false}) — resets both the browsed year AND the
  // selected month back to today's real ones, since DateStepper's version
  // only ever knows about the year prop it's bound to.
  function goToToday() {
    if (year !== todayYear) onYearChange(todayYear)
    setSelectedMonth(currentMonth)
  }

  // Selected-month chevrons/jump-sheet: DateStepper itself handles the
  // Dec/Jan year rollover, calling back with whichever year the stepped-to
  // month landed in — only forward that to onYearChange when it's actually
  // different from the year this page is already browsing.
  function handleSelectedMonthChange(y, m) {
    if (y !== year) onYearChange(y)
    setSelectedMonth(m)
  }

  // Behind an icon rather than spelled out across the toolbar, as on the
  // Annual and Special planners — four colour names ate the row this page
  // shares with the year stepper and the scope picker, and the key is
  // something you consult once, not something you read on every visit.
  const [requestOpen, setRequestOpen] = useState(false)
  // The weekend a request would be about: the next one this doctor is
  // rostered on, searched across the whole browsed year rather than the
  // selected month, since "let me off the next one" doesn't care which
  // month card happens to be selected.
  const requestSaturday = nextSaturdayToRequestOff({
    saturdays: monthCards.flatMap(m => m.markers.map(mk => mk.saturday)),
    byWeekend,
    profileId: myProfileId,
    today,
  })
  // No capacity reading — weekends have none to report. The panel exists to
  // hold the scope picker (its only home now) and the one action this page
  // never offered.
  // `id` differs per viewport: jsdom (and a real browser at a breakpoint
  // boundary) has both copies in the document, and two controls can't share
  // one id or the label points at whichever came first.
  function renderRequestPanel(id) {
    return (
      <PlannerRequestPanel
        eyebrow={`Weekend planner · ${year}`}
        actionLabel="Request weekend off"
        onAction={() => setRequestOpen(true)}
      >
        <label className="mt-1.5 block text-[11px] font-semibold text-ink-muted" htmlFor={id}>Showing</label>
        <div className="mt-1">
          <SelectMenu id={id} value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
        </div>
      </PlannerRequestPanel>
    )
  }

  const legend = <WeekendLegendTrigger states={Object.values(scope === 'all' ? HEALTH_STYLE : STATE_STYLE)} />
  // Always there, not only while browsing away from today: a control that
  // comes and goes is harder to reach for than one that is simply always
  // in the same place (DateStepper's own Today makes the same call), and
  // pressing it on today is a harmless no-op.
  const todayButton = (
    <button type="button" onClick={goToToday} aria-label="Today" title="Today" className="btn-secondary h-[30px] w-[30px] p-0"><TodayIcon className="h-4 w-4" /></button>
  )

  return (
    <div>
      {/* ── Mobile: the month finder the Annual and Special planners give a
          doctor — months as one line of weekend blocks each, ordered by
          time rather than laid out as a 12-card grid to scan. The grid and
          its sticky inspector below stay on desktop, where there's room for
          both at once. ── */}
      <div data-testid="my-weekend-month-finder" className="lg:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Weekend Planner</h2>
          <div className="flex flex-wrap items-center gap-2">
            <DateStepper unit="year" year={year} onChange={onYearChange} showToday={false} />
            {todayButton}
            {legend}
          </div>
        </div>
        {/* Above the months, not beside the year: it changes what every
            tile below means, so it reads as the heading for the list. */}
        <div className="mt-3">{renderRequestPanel('weekend-scope-mobile')}</div>

        {currentMonthCard && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Current month</p>
            <div className="mt-2 space-y-2">
              <MyWeekendMonthTile month={currentMonthCard} scope={scope} onOpen={() => onOpenMonth(currentMonthCard.month)} />
            </div>
          </div>
        )}

        {comingMonthCards.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Coming months</p>
            <div className="mt-2 space-y-2">
              {comingMonthCards.map(m => <MyWeekendMonthTile key={m.month} month={m} scope={scope} onOpen={() => onOpenMonth(m.month)} />)}
            </div>
          </div>
        )}

        {previousMonthCards.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Previous months</p>
            <div className="mt-2 space-y-2">
              {previousMonthCards.map(m => <MyWeekendMonthTile key={m.month} month={m} scope={scope} onOpen={() => onOpenMonth(m.month)} />)}
            </div>
          </div>
        )}
      </div>

      <div data-testid="my-weekend-dashboard" className="hidden lg:block">
      {/* ── Toolbar: year selector, then this page's own Today, then Legend,
          all in one cluster on the right. ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Weekend Planner</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Showing now lives in the rail panel below, beside the action it
              frames — one control, not one per viewport plus one in the
              toolbar. */}
          <DateStepper unit="year" year={year} onChange={onYearChange} showToday={false} />
          {todayButton}
          {legend}
        </div>
      </div>

      {/* ── Main workspace: 3x4 month grid + sticky inspector ── */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2 lg:flex-1 lg:grid-cols-3">
          {monthCards.map(m => (
            <MyWeekendMonthCard
              key={m.month}
              month={m}
              scope={scope}
              isSelected={m.month === selectedMonth}
              onSelect={() => m.month === selectedMonth ? onOpenMonth(m.month) : setSelectedMonth(m.month)}
            />
          ))}
        </div>

        <div className={`order-first w-full flex-shrink-0 lg:order-none lg:sticky lg:top-4 ${PANEL_DESKTOP_WIDTH}`}>
        {renderRequestPanel('weekend-scope-desktop')}
        <div
          data-testid="my-weekend-year-inspector"
          className="mt-3 rounded-lg border border-slate-line bg-canvas-raised p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected month</p>
          <div className="mt-1">
            <DateStepper unit="month" year={year} month={selectedMonth} onChange={handleSelectedMonthChange} showToday={false} centered />
          </div>

          <div className="mt-3 space-y-3 border-t border-slate-line pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Weekends working</span>
              <span className="font-medium text-accent">{selectedTotals.working}</span>
            </div>
            {/* Requests split by status rather than the old pending-only
                line: an approved weekend off is the outcome a doctor comes
                here to confirm, and it used to be readable nowhere. */}
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Weekend off requests</span>
                <span className="font-medium text-ink">{selectedTotals.pending + selectedTotals.approved}</span>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                <span className="text-flagAmber">{selectedTotals.pending} pending</span>
                <span className="text-success">{selectedTotals.approved} approved</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenMonth(selectedMonth)}
            className="btn-primary mt-4 flex w-full items-center justify-center gap-1.5 text-sm"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open month
          </button>
        </div>
        </div>
      </div>
      </div>

      {requestOpen && (
        <Modal title="Request weekend off" onClose={() => setRequestOpen(false)} centered>
          <LeaveRequestForm
            initialLeaveType="weekend_exception"
            initialDateFrom={requestSaturday}
            initialDateTo={addDays(requestSaturday, 1)}
            onSubmitted={() => { setRequestOpen(false); onDataChanged?.() }}
          />
        </Modal>
      )}
    </div>
  )
}

// One month as a single line of weekend blocks — the mobile finder's row,
// matching the Annual/Special planners' month tiles. Reports the same three
// numbers the Selected month panel does, per month, since the finder
// replaces that panel on a phone. Under the All weekends scope the same row
// switches to the department's staffing read instead.
function MyWeekendMonthTile({ month, scope, onOpen }) {
  const all = scope === 'all'
  const markers = all ? month.staffingMarkers : month.markers
  const totals = monthTotals(month.markers)
  const requests = totals.pending + totals.approved
  const fullyPlanned = month.staffingMarkers.filter(m => m.state === 'green').length
  const openSlots = month.staffingMarkers.reduce((sum, m) => sum + (m.totalGroups - m.filledGroups), 0)

  const chip = all
    ? { text: `${fullyPlanned} of ${markers.length} planned`, className: fullyPlanned === markers.length ? 'bg-success-bg text-success' : 'bg-flagAmber-bg text-flagAmber' }
    : { text: totals.working === 0 ? 'No weekends' : `${totals.working} working`, className: totals.working > 0 ? 'bg-accent-tint text-accent' : 'bg-canvas-sunken text-ink-muted' }
  const summary = all
    ? (openSlots === 0 ? 'Every rotation group planned' : `${openSlots} open ${openSlots === 1 ? 'slot' : 'slots'} across the month`)
    : (requests === 0 ? 'No weekend off requests' : `Weekend off requests: ${totals.pending} pending, ${totals.approved} approved`)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-sm font-semibold text-ink">{month.label}</span>
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${chip.className}`}>{chip.text}</span>
        </div>
        {/* A month has four or five weekends, so these blocks are wide. At
            6px tall with a 2px gap they merged into a single rule from
            reading distance — taller, with a gap you can see, reads as
            separate weekends. */}
        <div className="mt-2 flex gap-1.5">
          {markers.map(m => {
            const style = all ? HEALTH_STYLE[m.state] : STATE_STYLE[m.state]
            return (
              <span
                key={m.saturday}
                className={`h-2.5 flex-1 rounded-sm ${style.swatch}`}
                title={`${formatShortDate(m.saturday)} — ${style.label}`}
              />
            )
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">{summary}</p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
    </button>
  )
}

// Same shell as the Annual and Special planners' legend triggers — one
// entry point to both the colour key and the weekend rules.
function WeekendLegendTrigger({ states }) {
  return (
    <LegendSheet
      ruleBullets={WEEKEND_RULE_BULLETS}
      trigger={onClick => (
        <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-secondary h-[30px] w-[30px] p-0">
          <LegendIcon className="h-4 w-4" />
        </button>
      )}
    >
      {/* The states the grid is actually painted with right now — the
          Showing picker swaps the whole palette, so a key listing both
          would name four colours that aren't on screen. */}
      <div data-testid="weekend-year-legend" className="flex flex-col gap-1.5 text-sm text-ink-muted">
        {states.map(state => (
          <span key={state.label} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-sm ${state.swatch}`} /> {state.label}
          </span>
        ))}
      </div>
    </LegendSheet>
  )
}

// The desktop grid's month card. It follows the same Showing scope as the
// mobile finder: on 'all' each block is the weekend's staffing health
// rather than this doctor's own working/off state, so the two views never
// disagree about what a colour means.
function MyWeekendMonthCard({ month, isSelected, onSelect, scope }) {
  const all = scope === 'all'
  const markers = all ? month.staffingMarkers : month.markers
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`card p-3 text-left transition-colors ${isSelected ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/40'}`}
    >
      <span className="font-display text-sm font-semibold text-ink">{month.label}</span>
      <div className="mt-2.5 flex flex-wrap gap-2 lg:gap-3">
        {markers.map(m => {
          const style = all ? HEALTH_STYLE[m.state] : STATE_STYLE[m.state]
          return (
            <span key={m.saturday} className="h-8 w-8 lg:h-9 lg:w-12" title={`${formatShortDate(m.saturday)} — ${style.label}`}>
              <span className={`block h-8 w-8 rounded-md lg:h-9 lg:w-12 ${style.square}`} />
            </span>
          )
        })}
      </div>
    </button>
  )
}
