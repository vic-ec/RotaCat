import { Link } from 'react-router-dom'
import { formatWeekdayDate, formatShortDateRange, formatTimestampDate } from '../../lib/dateRange'
import { LEAVE_TYPE_LABELS } from '../../lib/leaveRequests'
import { leaveDayCountLabel } from '../../lib/leaveCard'
import { coverKind, shiftStartLabel } from '../../lib/myYear'
import { rosterLinkForDate } from '../../lib/myYearData'
import { requestLink } from '../../lib/myYearLinks'
import PlannerDetailsCard from '../PlannerDetailsCard'
import LeaveCodeBox from './LeaveCodeBox'
import YearGlance from './YearGlance'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
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
          <div key={stat.label} className="min-w-0 border-l border-t border-slate-line p-3 sm:p-4">
            <dt className="text-xs font-medium text-ink-muted">{stat.label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{stat.value}</dd>
            {stat.sub && <dd className="mt-1 text-xs text-ink-muted">{stat.sub}</dd>}
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

// What the selected day is about: leave, the rostered shift and who is
// covering it, and where to open each.
function DayDetails({ day, data, profileId, isAdmin }) {
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
  const rosterTo = rosterLinkForDate(data.monthIds, day.date, shift ? { entry: shift.id } : { doctor: profileId })
  const request = leave && requestLink(leave)
  const capturedBy = leave?.submitted_by && leave.submitted_by !== leave.profile_id ? data.names[leave.submitted_by] : null

  return (
    <div className="mt-2 space-y-3 text-sm">
      {day.holidayName && <p className="text-ink-light">Public holiday · {day.holidayName}</p>}
      <dl className="space-y-2">
        <div>
          <dt className="text-xs font-medium text-ink-muted">Leave</dt>
          <dd className="mt-0.5 text-ink">
            {leave ? (
              <>
                <span className="flex items-center gap-2 font-semibold">
                  <LeaveCodeBox leaveType={leave.leave_type} />{LEAVE_TYPE_LABELS[leave.leave_type] || 'Leave'}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {formatShortDateRange(leave.date_from, leave.date_to)} · {leaveDayCountLabel(leave)}
                </span>
              </>
            ) : 'Not on leave'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted">Rostered shift</dt>
          <dd className="mt-0.5 text-ink">{shiftText}{shift && day.onCall ? ' · On call' : ''}</dd>
        </div>
        {kind && (
          <div>
            <dt className="text-xs font-medium text-ink-muted">Cover</dt>
            <dd className="mt-0.5 text-ink">{COVER_LINE[kind] || coverName}</dd>
          </div>
        )}
        {isAdmin && leave && (
          <div>
            <dt className="text-xs font-medium text-ink-muted">Captured</dt>
            <dd className="mt-0.5 text-ink">
              {capturedBy ? `By ${capturedBy}` : 'By the doctor'} on {formatTimestampDate(leave.created_at)}
            </dd>
          </div>
        )}
      </dl>
      <ul className="space-y-1 border-t border-slate-line pt-3">
        {rosterTo && <li><Link to={rosterTo} className="flex min-h-[44px] items-center font-medium text-accent hover:text-accent-dark md:min-h-0 md:py-1">Open this day on the roster ›</Link></li>}
        {request && <li><Link to={request.to} className="flex min-h-[44px] items-center font-medium text-accent hover:text-accent-dark md:min-h-0 md:py-1">Open leave request ›</Link></li>}
        {isAdmin && rosterTo && <li><Link to={`${rosterTo}&history=1`} className="flex min-h-[44px] items-center font-medium text-accent hover:text-accent-dark md:min-h-0 md:py-1">Roster change history ›</Link></li>}
      </ul>
    </div>
  )
}

export default function MyYearOverview({
  year, totals, days, breaks, lieu, holidaysWorked, data, profileId, isAdmin, showLate = false, selectedDate, onSelectDate,
}) {
  const selected = selectedDate ? days.find(d => d.date === selectedDate) : null
  return (
    <div className="space-y-6">
      <TotalsCard totals={totals} holidaysWorked={holidaysWorked} lieuOwed={lieu.owed} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-ink">Year at a glance · {year}</h2>
          <div className="card p-4">
            <YearGlance days={days} year={year} selectedDate={selectedDate} onSelect={onSelectDate} showLate={showLate} />
          </div>
        </section>
        <aside className="lg:pt-8">
          <PlannerDetailsCard
            eyebrow="Selected day"
            title={selected ? formatWeekdayDate(selected.date) : null}
            emptyMessage="Select a day to see details."
            open={Boolean(selected)}
            onClose={() => onSelectDate(null)}
          >
            {selected && <DayDetails day={selected} data={data} profileId={profileId} isAdmin={isAdmin} />}
          </PlannerDetailsCard>
        </aside>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Breaks</h2>
        <BreaksCard breaks={breaks} year={year} longBreakDays={data.settings.longBreakDays} />
      </section>
    </div>
  )
}
