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
  return (
    <div className="space-y-4">
      <div className="sheen-divider">
        <span>Late arrivals</span>
        <span className="divider-meta normal-case font-normal">{records.length} this year</span>
      </div>
      {!admin && (
        <p className="text-sm text-ink-muted">
          Shift start, arrival time and your reason, as recorded. Speak to an admin if a record looks wrong.
        </p>
      )}
      {records.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-ink-muted">No late arrivals recorded.</p>
      ) : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm" data-testid="late-arrivals-table">
              <thead>
                <tr className="border-b border-slate-line text-xs text-ink-muted">
                  {['Date', 'Shift', 'Shift start', 'Arrived', 'Late by', 'Reason given', ...(admin ? ['Logged by', 'Open in'] : [])].map(h => (
                    <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-line">
                {records.map((r, i) => (
                  <tr
                    key={r.id ?? `${r.entry_date}-${i}`}
                    onClick={admin ? () => onEdit?.(r) : undefined}
                    className={admin ? 'cursor-pointer hover:bg-canvas-sunken' : ''}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">
                      {admin
                        ? <button type="button" onClick={e => { e.stopPropagation(); onEdit?.(r) }} aria-label={`Edit late arrival, ${formatWeekdayDateShort(r.entry_date)}`} className="text-left font-semibold hover:underline">{formatWeekdayDateShort(r.entry_date)}</button>
                        : formatWeekdayDateShort(r.entry_date)}
                    </td>
                    <td className="px-4 py-3 text-ink">{labelForShiftCode(r.shift_code)}</td>
                    <td className="px-4 py-3 text-ink">{shiftStartLabel(r.shift_start)}</td>
                    <td className="px-4 py-3 text-ink">{shiftStartLabel(r.arrived_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">{lateByLabel(r.minutes_late)}</td>
                    <td className="px-4 py-3 text-ink-light">{r.reason_given || '—'}</td>
                    {admin && <td className="px-4 py-3 text-ink-light">{logger(r)}</td>}
                    {admin && (
                      <td className="px-4 py-3">
                        {rosterTo(r) && <Link to={rosterTo(r)} onClick={e => e.stopPropagation()} className="font-medium text-accent hover:text-accent-dark">Roster</Link>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="card divide-y divide-slate-line overflow-hidden md:hidden">
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
                    <button type="button" onClick={() => onEdit?.(r)} className="flex min-h-[44px] items-center font-medium text-accent">Edit</button>
                    {rosterTo(r) && <Link to={rosterTo(r)} className="flex min-h-[44px] items-center font-medium text-accent">Roster ›</Link>}
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
