import { Link } from 'react-router-dom'
import { formatWeekdayDateShort } from '../../lib/dateRange'
import { shiftStartLabel } from '../../lib/myYear'
import { lateByLabel } from '../../lib/lateArrivals'
import { labelForShiftCode } from '../../lib/shiftLabels'
import { rosterLinkForDate } from '../../lib/myYearData'

// Late arrivals for the year. Two readings of the same records:
//   admin  every column including who logged it; a row opens the form
//   own    date, shift, shift start, arrival, late by and reason — what
//          get_my_late_arrivals returns. No "Logged by", nothing to edit.
export default function MyYearAttendance({ records = [], admin = false, monthIds = {}, profileId, onEdit }) {
  const rosterTo = r => rosterLinkForDate(monthIds, r.entry_date, r.roster_entry_id ? { entry: r.roster_entry_id, mark: true } : { doctor: profileId, mark: true })
  const logger = r => (r.logger ? `${r.logger.name || ''} ${r.logger.surname || ''}`.trim() : '—')
  // One column the width of the Roster and Planners lists (the page sets
  // it), so the same two-line rows at every width; no section bar (the tab
  // says what this is).
  return (
    <div className="space-y-2">
      {!admin && (
        <p className="text-sm text-ink-muted">
          Shift start, arrival time and your reason, as recorded. Speak to an admin if a record looks wrong.
        </p>
      )}
      {records.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-ink-muted">No late arrivals recorded.</p>
      ) : (
        <>
          <ul className="card divide-y divide-slate-line overflow-hidden" data-testid="late-arrivals-list">
            {records.map((r, i) => (
              <li key={r.id ?? `${r.entry_date}-${i}`} className="p-4">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-ink">{formatWeekdayDateShort(r.entry_date)}</span>
                  <span className="text-sm font-semibold text-ink">{lateByLabel(r.minutes_late)} late</span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {labelForShiftCode(r.shift_code)} · start {shiftStartLabel(r.shift_start)} · arrived {shiftStartLabel(r.arrived_at)}
                </p>
                <p className="mt-1 text-sm text-ink-light">Reason given: {r.reason_given || '—'}</p>
                {admin && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm">
                    <span className="text-xs text-ink-muted">Logged by {logger(r)}</span>
                    <button type="button" onClick={() => onEdit?.(r)} aria-label={`Edit late arrival, ${formatWeekdayDateShort(r.entry_date)}`} className="flex min-h-[44px] items-center font-medium text-accent md:min-h-0 md:py-1">Edit</button>
                    {rosterTo(r) && <Link to={rosterTo(r)} className="flex min-h-[44px] items-center font-medium text-accent md:min-h-0 md:py-1">Roster ›</Link>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
