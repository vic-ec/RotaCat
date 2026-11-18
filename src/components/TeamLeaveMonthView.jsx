import { useMemo, useState } from 'react'
import Modal from './Modal'
import PlannerCalendarGrid from './PlannerCalendarGrid'
import TeamLeavePersonRow from './TeamLeavePersonRow'
import { datesInMonth, columnForLeaveCategory, COLUMN_BADGE_LABEL } from '../lib/leaveYearGrid'
import { todayStr, formatWeekdayDate } from '../lib/dateRange'
import { peopleAwayByDate } from '../lib/teamLeaveMobile'

// One month of "who is away", on the same calendar the Annual and Special
// planners use (PlannerCalendarGrid) rather than a second grid of its own —
// same cell footprint, same Monday-first columns, same slot pips on every
// day, so a doctor reading leave here and capacity there is reading one
// calendar twice rather than two that merely rhyme. Tapping a day opens a
// sheet listing that day's people; tapping a person opens their leave's
// full detail via onSelectLeave.
//
// The pips count people away against the same 3-slot scale the planners
// use — that ceiling is the department's, not one planner's — and a day
// past it reads "+N", as it does there.
export default function TeamLeaveMonthView({ requests, year, month, onSelectLeave }) {
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
        <Modal title={formatWeekdayDate(selectedDate)} onClose={() => setSelectedDate(null)}>
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
