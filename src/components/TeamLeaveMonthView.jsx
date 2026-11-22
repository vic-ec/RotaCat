import { useMemo, useState } from 'react'
import Modal from './Modal'
import PlannerCalendarGrid from './PlannerCalendarGrid'
import TeamLeavePersonRow from './TeamLeavePersonRow'
import { StepperShell } from './DateStepper'
import { datesInMonth, columnForLeaveCategory, COLUMN_BADGE_LABEL } from '../lib/leaveYearGrid'
import { todayStr, addDays, formatWeekdayDate, formatWeekdayDateShort } from '../lib/dateRange'
import { peopleAwayByDate } from '../lib/teamLeaveMobile'

// One month of "who is away", on the same calendar the Annual and Special
// planners use (PlannerCalendarGrid) rather than a second grid of its own —
// same cell footprint, same Monday-first columns, same slot pips on every
// day, so a doctor reading leave here and capacity there is reading one
// calendar twice rather than two that merely rhyme. Tapping a day opens a
// sheet listing that day's people; tapping a person opens their leave's
// full detail via onSelectLeave.
//
// The sheet steps a day at a time from its own header, so reading a run of
// days doesn't mean closing it, tapping the next cell and reopening it.
// Stepping past the month's edge moves the grid behind to the next month
// (onMonthChange). The sheet holds one short height while stepping, so the
// arrows stay put under the finger and most of the grid stays in view; a
// busy day scrolls its list instead.
//
// The pips count people away against the same 3-slot scale the planners
// use — that ceiling is the department's, not one planner's — and a day
// past it reads "+N", as it does there.
export default function TeamLeaveMonthView({ requests, year, month, onMonthChange, onSelectLeave }) {
  const [selectedDate, setSelectedDate] = useState(null)
  const dates = useMemo(() => datesInMonth(year, month), [year, month])
  const awayByDate = useMemo(() => peopleAwayByDate(requests, dates), [requests, dates])
  const today = todayStr()

  // Pending leave reads italic in a cell, exactly as it does on the
  // planners — it is a request, not yet a fact.
  const cells = useMemo(() => {
    const map = new Map()
    for (const [date, people] of awayByDate) {
      if (people.length === 0) continue
      map.set(date, {
        used: people.length,
        names: people.map(({ doctor, request, status }) => ({
          key: `${request.id}-${status}`,
          label: doctor.surname || doctor.name || 'Unknown',
          badge: COLUMN_BADGE_LABEL[columnForLeaveCategory(doctor.category, doctor.contract_type)],
          pending: status === 'pending',
        })),
      })
    }
    return map
  }, [awayByDate])

  const dayPeople = selectedDate ? (awayByDate.get(selectedDate) || []) : []

  function stepDay(delta) {
    const next = addDays(selectedDate, delta)
    const nextYear = Number(next.slice(0, 4))
    const nextMonth = Number(next.slice(5, 7))
    if (nextYear !== year || nextMonth !== month) onMonthChange(nextYear, nextMonth)
    setSelectedDate(next)
  }

  const dayHeader = selectedDate && (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {/* Shown as 0 rather than hidden on an empty day, so the stepper
          beside it never shifts sideways mid-step. */}
      <span
        title={`${dayPeople.length} ${dayPeople.length === 1 ? 'person' : 'people'} away`}
        className="flex h-[30px] min-w-[40px] flex-shrink-0 flex-col items-center justify-center rounded-md border border-slate-line px-1.5 leading-none"
      >
        <span className={`text-sm font-bold leading-none ${dayPeople.length ? 'text-ink' : 'text-ink-muted'}`}>{dayPeople.length}</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-muted">away</span>
      </span>
      <div className="min-w-0 flex-1">
        <StepperShell
          centered
          label={formatWeekdayDateShort(selectedDate)}
          onPrev={() => stepDay(-1)}
          onNext={() => stepDay(1)}
          prevLabel="Previous day"
          nextLabel="Next day"
        />
      </div>
    </div>
  )

  return (
    <div className="mt-4">
      <PlannerCalendarGrid
        year={year}
        month={month}
        cells={cells}
        selectedDate={selectedDate}
        today={today}
        onSelect={setSelectedDate}
        pipLabel={used => `${used} ${used === 1 ? 'person' : 'people'} away`}
      />

      {selectedDate && (
        <Modal
          title={formatWeekdayDate(selectedDate)}
          header={dayHeader}
          heightClassName="h-[42dvh] min-h-[260px]"
          onClose={() => setSelectedDate(null)}
        >
          {dayPeople.length === 0 ? (
            <p className="text-sm text-ink-muted">No one is on leave this day.</p>
          ) : (
            <div className="space-y-1.5">
              {dayPeople.map(({ request }) => (
                <TeamLeavePersonRow
                  key={request.id}
                  request={request}
                  onSelect={r => { setSelectedDate(null); onSelectLeave(r) }}
                />
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
