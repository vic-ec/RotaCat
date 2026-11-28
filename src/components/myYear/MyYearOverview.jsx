import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { formatWeekdayDate, formatShortDateRange, todayStr } from '../../lib/dateRange'
import { LEAVE_TYPE_LABELS } from '../../lib/leaveRequests'
import { leaveDayCountLabel } from '../../lib/leaveCard'
import { coverKind, shiftStartLabel } from '../../lib/myYear'
import { rosterLinkForDate } from '../../lib/myYearData'
import { leaveDestination } from '../../lib/myYearLinks'
import LeaveCodeBox from './LeaveCodeBox'
import YearGlance from './YearGlance'
import { ActionSheet } from '../ActionSheet'
import { plural } from '../../lib/text'

const rangeWithYear = r => `${formatShortDateRange(r.from, r.to)} ${r.to.slice(0, 4)}`

// Same shape as My leave's balance card, six figures instead of three:
// six across on desktop, three across on a phone.
export function TotalsCard({ totals, holidaysWorked, lieuOwed }) {
  const stats = [
    { label: 'Days left', value: totals.daysLeft },
    { label: 'Days booked', value: totals.daysBooked, sub: `${totals.daysTaken} taken · ${totals.daysUpcoming} upcoming` },
    { label: 'Pending requests', value: totals.pendingRequests },
    { label: 'Sick days', value: totals.sickDays, sub: plural(totals.sickRequests, 'request') },
    { label: 'Public holidays worked', value: holidaysWorked },
    { label: 'Days in lieu owed', value: lieuOwed },
  ]
  return (
    <div className="card overflow-hidden" data-testid="my-year-totals">
      <dl className="-ml-px -mt-px grid grid-cols-3 lg:grid-cols-6">
        {stats.map(stat => (
          // Label, number and note sit on rows the whole line of tiles shares
          // (subgrid), so a label that wraps to two lines never pushes its
          // number below its neighbours'.
          <div key={stat.label} className="row-span-3 grid min-w-0 grid-rows-subgrid gap-0 border-l border-t border-slate-line p-3 sm:p-4">
            <dt className="text-xs font-medium text-ink-muted">{stat.label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{stat.value}</dd>
            <dd className="mt-1 text-xs text-ink-muted">{stat.sub || ''}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-slate-line px-3 py-2 text-xs text-ink-muted sm:px-4">
        {totals.allowance} days a year · resets on 1 January
      </p>
    </div>
  )
}

function Line({ label, children }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">{children}</dd>
    </div>
  )
}

export function BreaksCard({ breaks, year, longBreakDays }) {
  const { last, next, longestStretch, noneSinceJoining } = breaks
  const long = last && !last.ongoing && last.daysAgo > longBreakDays
  return (
    <div className="card overflow-hidden" data-testid="my-year-breaks">
      <dl className="divide-y divide-slate-line">
        <Line label="Last break">
          {noneSinceJoining ? 'None since joining' : (
            <>
              <span>{rangeWithYear(last)} · {last.ongoing ? 'on a break now' : `${plural(last.daysAgo, 'day')} ago`}</span>
              {long && <span className="chip-amber rounded-full px-2 py-0.5 text-xs font-medium">Over {longBreakDays} days</span>}
            </>
          )}
        </Line>
        <Line label={`Longest stretch without a break in ${year}`}>{plural(longestStretch, 'day')}</Line>
        <Line label="Next booked break">
          {next ? `${rangeWithYear(next)} · in ${plural(next.daysAway, 'day')}` : 'None booked'}
        </Line>
      </dl>
      <p className="border-t border-slate-line px-4 py-2 text-xs text-ink-muted">
        A break is 5 or more days of annual leave in a row.
      </p>
    </div>
  )
}

const COVER_LINE = { not_covered: 'Shift not covered', open_locum: 'Open locum slot' }

const linkClass = 'inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:text-accent-dark md:min-h-0 md:pt-1'

// What the selected day is about: its leave or its rostered shift (both
// only when both are on record), each with its own link directly under it. On a phone
// the same columns stack as lines with the link at the right.
function DayDetails({ day, data, profileId, isAdmin, own = false, compact = false }) {
  const teamLeaveFits = useIsDesktop(1024)
  const { leave, shift } = day
  const cameOff = shift && (shift.vacated_profile_id === profileId || (shift.profile_id === profileId && leave))
  const kind = cameOff ? coverKind(shift, profileId) : null
  const coverName = kind === 'colleague'
    ? (data.names[shift.profile_id] || 'A colleague')
    : kind === 'locum' ? (String(shift.locum_name || '').trim() || data.names[shift.profile_id] || 'Locum') : null
  const published = data.publishedMonths.has(day.date.slice(0, 7))
  const shiftLabel = shift?.shift_types?.label || shift?.shift_types?.code || 'Shift'
  const shiftStart = shift ? shiftStartLabel(shift.start_time_override || shift.shift_types?.start_time) : ''
  // A shift type's label is often its start time already.
  const shiftText = shift
    ? (shiftLabel.includes(shiftStart) ? shiftLabel : `${shiftLabel} · ${shiftStart}`)
    : day.onCall ? 'On call' : published ? 'No shift' : 'No published roster'
  const shiftSub = kind ? `Cover: ${COVER_LINE[kind] || coverName}`
    : shift && day.onCall ? 'On call' : ''
  const rosterTo = rosterLinkForDate(data.monthIds, day.date, shift ? { entry: shift.id, mark: true } : { doctor: profileId, mark: true })
  // Admins open the leave on Team Leave's Matrix (their row, that period);
  // the Matrix needs a wide screen, and doctors don't have Team Leave, so
  // everyone else gets the planner (or the pending request).
  // The request itself where it is shown (see leaveDestination): Team
  // Leave for an admin on a wide screen; a planner month, My Requests or
  // the Leave tab otherwise; nothing for rejected or cancelled leave.
  const dest = leave && leaveDestination(leave, { isAdmin, own, wide: teamLeaveFits, profileId, teamLeave: true })
  const leaveTo = dest && { to: dest.to, label: `Open in ${dest.label} ›`, short: `${dest.label} ›` }
  const capturedBy = leave?.submitted_by && leave.submitted_by !== leave.profile_id ? data.names[leave.submitted_by] : null

  // One or the other, as a person on leave isn't rostered and vice versa:
  // leave alone, the shift alone, or both only when both are on record (a
  // rostered shift they came off, e.g. sick). Neither: one line saying so.
  const offLine = {
    key: 'off',
    label: 'Day',
    value: day.onCall ? 'On call' : published ? 'Off' : 'No leave',
    sub: day.onCall ? 'No leave or rostered shift' : published ? 'No leave and no rostered shift' : 'No published roster for this month yet',
    link: rosterTo ? { to: rosterTo, label: 'Open this day on the roster ›', short: 'Roster ›' } : null,
  }
  const allColumns = [
    {
      key: 'leave',
      label: 'Leave',
      value: leave ? (
        <span className="flex items-center gap-2"><LeaveCodeBox leaveType={leave.leave_type} />{LEAVE_TYPE_LABELS[leave.leave_type] || 'Leave'}</span>
      ) : 'Not on leave',
      // Who put it on record only when it wasn't the doctor (an admin
      // capturing it for them); "by the doctor" said nothing.
      sub: leave ? `${formatShortDateRange(leave.date_from, leave.date_to)} · ${leaveDayCountLabel(leave)}${capturedBy ? ` · captured by ${capturedBy}` : ''}` : '',
      link: leaveTo,
    },
    {
      key: 'shift',
      label: 'Rostered shift',
      value: shiftText,
      sub: shiftSub,
      link: rosterTo ? { to: rosterTo, label: 'Open this day on the roster ›', short: 'Roster ›' } : null,
    },
  ]
  const columns = leave && shift ? allColumns
    : leave ? allColumns.filter(c => c.key === 'leave')
      : shift ? allColumns.filter(c => c.key === 'shift')
        : [offLine]

  if (compact) {
    return (
      <dl className="mt-1 divide-y divide-slate-line text-sm">
        {columns.map(col => (
          <div key={col.key} data-testid={`day-${col.key}`} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <dt className="text-xs font-medium text-ink-muted">{col.label}</dt>
              <dd className="mt-0.5 font-semibold text-ink">{col.value}</dd>
              {col.sub && <dd className="text-xs text-ink-muted">{col.sub}</dd>}
            </div>
            {col.link && <Link to={col.link.to} aria-label={col.link.label.replace(' ›', '')} className={`${linkClass} flex-shrink-0`}>{col.link.short}</Link>}
          </div>
        ))}
      </dl>
    )
  }
  return (
    // Always three tracks, so each column stays put from day to day.
    <dl className="mt-2 grid grid-cols-2 gap-4 text-sm">
      {columns.map(col => (
        <div key={col.key} data-testid={`day-${col.key}`} className="min-w-0">
          <dt className="text-xs font-medium text-ink-muted">{col.label}</dt>
          <dd className="mt-0.5 font-semibold text-ink">{col.value}</dd>
          {col.sub && <dd className="text-xs text-ink-muted">{col.sub}</dd>}
          {col.link && <dd><Link to={col.link.to} className={linkClass}>{col.link.label}</Link></dd>}
        </div>
      ))}
    </dl>
  )
}

// The selected day, in a card under the grid.
function SelectedDayCard({ day, data, profileId, isAdmin, own, compact, onClose }) {
  const isToday = day.date === todayStr()
  return (
    <div className={`card relative ${compact ? 'mb-2 px-3 py-2' : 'mt-2 px-4 py-3'}`} data-testid="selected-day-card">
      <p className="pr-8">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{compact && isToday ? 'Today' : 'Selected day'}</span>{' '}
        <span className={`${compact ? 'block' : ''} font-display text-sm font-semibold text-ink`}>{formatWeekdayDate(day.date)}</span>
        {!compact && isToday && <span className="ml-2 rounded-full bg-accent px-2 py-px align-[1px] text-[10px] font-bold text-on-fill">Today</span>}
      </p>
      {day.holidayName && <p className="mt-0.5 text-xs text-ink-light">Public holiday · {day.holidayName}</p>}
      <DayDetails day={day} data={data} profileId={profileId} isAdmin={isAdmin} own={own} compact={compact} />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close selected day"
          className="btn-close absolute right-2 top-2 h-7 w-7 text-ink-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export default function MyYearOverview({
  year, totals, days, breaks, lieu, holidaysWorked, data, profileId, isAdmin, own = false, showLate = false, selectedDate, onSelectDate,
}) {
  const isDesktop = useIsDesktop()
  // A phone: the card above the grid is always today; a day tapped in an
  // opened month opens in a sheet where it was tapped, so nothing needs a
  // scroll back up to read. A desktop: the card under the grid is the
  // selected day.
  const [sheetDate, setSheetDate] = useState(null)
  const sheetDay = sheetDate ? days.find(d => d.date === sheetDate) : null
  const selected = isDesktop
    ? (selectedDate ? days.find(d => d.date === selectedDate) : null)
    : days.find(d => d.date === todayStr()) || null
  const card = selected && (
    <SelectedDayCard
      day={selected}
      data={data}
      profileId={profileId}
      isAdmin={isAdmin}
      own={own}
      compact={!isDesktop}
      onClose={isDesktop ? () => onSelectDate(null) : null}
    />
  )
  return (
    <div className="space-y-6">
      <TotalsCard totals={totals} holidaysWorked={holidaysWorked} lieuOwed={lieu.owed} />

      {/* The grid takes the full width. The selected day's card opens on
          today: under the grid on a desktop (a click picks another day),
          above it on a phone (a day is picked from an opened month). */}
      <section className="min-w-0">
        <h2 className="mb-2 text-sm font-semibold text-ink">Year at a glance · {year}</h2>
        {!isDesktop && card}
        <div className="card p-4">
          <YearGlance
            days={days}
            year={year}
            selectedDate={isDesktop ? selectedDate : sheetDate}
            openOn={todayStr()}
            onSelect={isDesktop ? onSelectDate : setSheetDate}
            showLate={showLate}
          />
        </div>
        {isDesktop && (card || <p className="mt-2 text-xs text-ink-muted">Select a day to see its details.</p>)}
      </section>

      {!isDesktop && sheetDay && (
        <ActionSheet title={formatWeekdayDate(sheetDay.date)} onClose={() => setSheetDate(null)}>
          <div className="px-3 pb-2" data-testid="day-sheet">
            {sheetDay.holidayName && <p className="text-xs text-ink-light">Public holiday · {sheetDay.holidayName}</p>}
            <DayDetails day={sheetDay} data={data} profileId={profileId} isAdmin={isAdmin} own={own} compact />
          </div>
        </ActionSheet>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Breaks</h2>
        <BreaksCard breaks={breaks} year={year} longBreakDays={data.settings.longBreakDays} />
      </section>
    </div>
  )
}
