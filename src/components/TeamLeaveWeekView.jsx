import TeamLeavePersonRow from './TeamLeavePersonRow'
import { todayStr, formatWeekdayDate } from '../lib/dateRange'
import { weekStart, buildWeekAgenda } from '../lib/teamLeaveMobile'
import { formatDMY } from '../lib/leaveMatrix'

// The default mobile view: a chronological, summarised agenda for the selected
// week. An "On leave" section anchored to today (or the week's start when
// browsing another week), then leave that starts later in the week grouped by
// day. Each person appears once (see buildWeekAgenda). Rows open the leave's
// full detail via onSelectLeave.
export default function TeamLeaveWeekView({ requests, weekAnchor, onSelectLeave }) {
  const today = todayStr()
  const { anchor, onLeave, startingByDay } = buildWeekAgenda(requests, weekStart(weekAnchor), today)
  const anchorIsToday = anchor === today

  return (
    <div className="mt-4 space-y-5">
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {anchorIsToday ? 'On leave today' : 'On leave'} · {formatDMY(anchor)}
          </h3>
          {onLeave.length > 0 && (
            <span className="text-xs text-ink-muted">{onLeave.length} {onLeave.length === 1 ? 'person' : 'people'}</span>
          )}
        </div>
        {onLeave.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No team leave {anchorIsToday ? 'today' : 'on this day'}.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {onLeave.map(r => <TeamLeavePersonRow key={r.id} request={r} onSelect={onSelectLeave} />)}
          </div>
        )}
      </section>

      {startingByDay.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Starting this week</h3>
          <div className="mt-2 space-y-4">
            {startingByDay.map(group => (
              <div key={group.date}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-medium text-ink">{formatWeekdayDate(group.date)}</h4>
                  <span className="text-xs text-ink-muted">{group.items.length} starting</span>
                </div>
                <div className="space-y-1.5">
                  {group.items.map(r => <TeamLeavePersonRow key={r.id} request={r} onSelect={onSelectLeave} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
