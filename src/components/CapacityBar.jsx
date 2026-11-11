import { LEAVE_CAPACITY_STATES } from '../lib/leaveYearGrid'
import { capacityBarLabels } from '../lib/plannerCalendar'

// One horizontal bar for a month: four segments, each as wide as the number
// of days at that slot level (0, 1, 2, 3+ used), in the capacity scale's
// own colours, with a 2x2 legend under it — "7 days · 0 of 3 used", "3 days
// · 1 of 3", "14 days · 2 of 3", "7 days · full". Replaces the Annual
// overview's three "N of 3 slots taken" tiles and sits in the month view's
// request panel. `buckets` is daysBySlotsUsed's output (every level present,
// zero days included — those legend entries are greyed, and their segment
// is simply absent from the bar). `labels` lets Special word the last level
// "at guideline" instead of "full"; `heading`/`aside` are the optional
// caption row above the bar ("LEAVE SLOTS · 31 DAYS" / "7 days full").
export default function CapacityBar({ buckets, labels, heading, aside, max = 3, className = '' }) {
  const total = buckets.reduce((sum, b) => sum + b.days, 0)
  const legend = labels ?? capacityBarLabels(max)
  const aria = buckets.map(b => `${b.days} ${b.days === 1 ? 'day' : 'days'} ${legend[b.level]}`).join(', ')

  return (
    <div className={className}>
      {(heading || aside) && (
        <div className="flex items-baseline justify-between gap-2">
          {heading && <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{heading}</p>}
          {aside && <p className="text-[11px] font-medium text-ink-light">{aside}</p>}
        </div>
      )}
      <div role="img" aria-label={aria} className={`flex h-2.5 w-full overflow-hidden rounded-full bg-canvas-sunken ${heading || aside ? 'mt-1.5' : ''}`}>
        {buckets.filter(b => b.days > 0).map(b => (
          <span
            key={b.level}
            data-level={b.level}
            style={{ flexGrow: b.days, flexBasis: 0 }}
            className={`block h-full ${LEAVE_CAPACITY_STATES[Math.min(b.level, 3)].fill}`}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {buckets.map(b => {
          const state = LEAVE_CAPACITY_STATES[Math.min(b.level, 3)]
          const empty = b.days === 0
          return (
            <li key={b.level} className={`flex items-center gap-1.5 text-[11px] ${empty ? 'text-ink-muted/60' : 'text-ink-light'}`}>
              <span className={`h-2 w-2 flex-shrink-0 rounded-[3px] ${empty ? 'ring-1 ring-inset ring-ink-muted/40' : state.fill}`} />
              <span className="tabular-nums">{b.days} {b.days === 1 ? 'day' : 'days'} · {legend[b.level]}</span>
            </li>
          )
        })}
      </ul>
      {total === 0 && <p className="mt-1 text-[11px] text-ink-muted">No days in range.</p>}
    </div>
  )
}
