import { useMemo, useState } from 'react'
import Modal from './Modal'
import TeamLeavePersonRow from './TeamLeavePersonRow'
import { datesInMonth, weeksForMonth } from '../lib/leaveYearGrid'
import { todayStr, formatWeekdayDate } from '../lib/dateRange'
import { peopleAwayByDate } from '../lib/teamLeaveMobile'

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// A one-month calendar (Sunday-start, mirroring LeaveYearGrid's MonthGlance)
// where each day shows a headcount of people away — no surnames in cells.
// Tapping a day opens a bottom-sheet listing that day's people; tapping a
// person opens their leave's full detail via onSelectLeave.
export default function TeamLeaveMonthView({ requests, year, month, onSelectLeave }) {
  const [selectedDate, setSelectedDate] = useState(null)
  const dates = useMemo(() => datesInMonth(year, month), [year, month])
  const weeks = useMemo(() => weeksForMonth(year, month), [year, month])
  const awayByDate = useMemo(() => peopleAwayByDate(requests, dates), [requests, dates])
  const today = todayStr()

  const dayPeople = selectedDate ? (awayByDate.get(selectedDate) || []) : []

  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-muted">
        {WEEKDAY_SHORT.map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />
          const count = (awayByDate.get(date) || []).length
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(date)}
              aria-label={`${formatWeekdayDate(date)} — ${count} ${count === 1 ? 'person' : 'people'} away`}
              className={`flex min-h-[52px] flex-col items-center justify-start gap-1 rounded border border-slate-line bg-canvas-raised pt-1.5 text-xs hover:bg-canvas-sunken ${isToday ? 'ring-1 ring-accent' : ''}`}
            >
              <span className="text-ink">{Number(date.slice(-2))}</span>
              {count > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-tint px-1 text-[11px] font-semibold text-accent">{count}</span>
              )}
            </button>
          )
        })}
      </div>

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
