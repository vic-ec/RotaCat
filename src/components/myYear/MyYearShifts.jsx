import { Link } from 'react-router-dom'
import { formatWeekdayDateShort } from '../../lib/dateRange'
import { SHIFT_GROUPS } from '../../lib/myYear'
import { rosterLinkForDate } from '../../lib/myYearData'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function MyYearShifts({ year, shifts, onCall, lieu, holidayRows, data, hoursSummaryTo }) {
  const max = Math.max(1, ...SHIFT_GROUPS.map(g => shifts.counts[g.key]))
  const nightBefore = data.settings.lieuCountNightBefore
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Shifts worked · {year}</h2>
          <Link to={hoursSummaryTo} className="flex min-h-[44px] items-center text-sm font-medium text-accent hover:text-accent-dark md:min-h-0">Hours Summary ›</Link>
        </div>
        <div className="card p-4" data-testid="my-year-shift-bars">
          <ul className="space-y-3">
            {SHIFT_GROUPS.map(g => {
              const count = shifts.counts[g.key]
              return (
                <li key={g.key} className="flex items-center gap-3 text-sm">
                  <span className="w-28 flex-shrink-0 text-ink-light">{g.label}</span>
                  <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-canvas-sunken" aria-hidden="true">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                  <span className="w-8 flex-shrink-0 text-right font-semibold text-ink">{count}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 border-t border-slate-line pt-3 text-xs text-ink-muted">
            {plural(shifts.total, 'shift')} on published rosters.
            {onCall.length > 0 && ` On call on ${plural(onCall.length, 'day')}.`}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Public holidays and days in lieu</h2>
        <div className="card overflow-hidden" data-testid="my-year-lieu">
          <dl className="-ml-px grid grid-cols-3">
            {[
              { label: `Public holiday shifts worked · ${year}`, value: holidayRows.length },
              { label: 'Days in lieu taken', value: lieu.taken },
              { label: 'Days in lieu owed', value: lieu.owed },
            ].map(stat => (
              // Shared rows (subgrid): a wrapped label never moves its number.
              <div key={stat.label} className="row-span-2 grid min-w-0 grid-rows-subgrid gap-0 border-l border-slate-line p-3 sm:p-4">
                <dt className="text-xs font-medium text-ink-muted">{stat.label}</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
          {holidayRows.length === 0 ? (
            <p className="border-t border-slate-line px-4 py-3 text-sm text-ink-muted">No public holiday shifts worked in {year}.</p>
          ) : (
            <ul className="divide-y divide-slate-line border-t border-slate-line">
              {holidayRows.map(row => {
                const to = rosterLinkForDate(data.monthIds, row.date, { entry: row.entryId })
                return (
                  <li key={row.entryId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold text-ink">{formatWeekdayDateShort(row.date)}</span>
                      <span className="text-ink-light"> · {row.holidayName}{row.nightBefore ? ' (night before)' : ''} · {row.shiftType?.label || row.shiftCode}</span>
                    </span>
                    {to && <Link to={to} className="flex min-h-[44px] items-center font-medium text-accent hover:text-accent-dark md:min-h-0">Roster ›</Link>}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="border-t border-slate-line px-4 py-2 text-xs text-ink-muted">
            One day in lieu is earned for each public holiday shift worked on a published roster.
            A night shift that starts the evening before a public holiday {nightBefore ? 'also earns one' : 'does not earn one'}.
            Days taken are approved time off in lieu. Taken and owed run across all years, not just {year}.
          </p>
        </div>
      </section>
    </div>
  )
}
