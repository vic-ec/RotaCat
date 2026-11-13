import { LEAVE_CAPACITY_STATES } from '../lib/leaveYearGrid'
import { capacityBarLabels } from '../lib/plannerCalendar'

// One horizontal bar for a month: four segments, each as wide as the number
// of days at that slot level (0, 1, 2, 3+ used), in the capacity scale's
// own colours, with a 2x2 legend under it — "0/3 slots used · 7 days",
// "1/3 slots used · 3 days", "2/3 slots used · 14 days", "3/3 slots used ·
// 7 days". Replaces the Annual
// overview's three "N of 3 slots taken" tiles and sits in the month view's
// request panel. `buckets` is daysBySlotsUsed's output (every level present,
// zero days included — those legend entries are greyed, and their segment
// is simply absent from the bar). `labels` overrides the level wording;
// `heading`/`aside` are the optional
// caption row above the bar ("LEAVE SLOTS · 31 DAYS" / "7 days full").
export default function CapacityBar({ buckets, labels, heading, aside, max = 3, className = '' }) {
  const total = buckets.reduce((sum, b) => sum + b.days, 0)
  const legend = labels ?? capacityBarLabels(max)
  const aria = buckets.map(b => `${legend[b.level]} ${b.days} ${b.days === 1 ? 'day' : 'days'}`).join(', ')

  return (
    <div className={className}>
      {(heading || aside) && (
        <div className="flex items-baseline justify-between gap-2">
          {heading && <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{heading}</p>}
          {aside && <p className="text-[11px] font-medium text-ink-light">{aside}</p>}
        </div>
      )}
      {/* The segments carry their own rounding on the two ends rather than
          relying on the track's overflow clip alone: a clipped child under a
          rounded parent is anti-aliased separately from the parent in
          Chrome, which made the middle segments look taller than the
          rounded ends. `isolate` keeps the clip on its own layer too. */}
      <div role="img" aria-label={aria} className={`isolate flex h-2.5 w-full overflow-hidden rounded-full bg-canvas-sunken ${heading || aside ? 'mt-1.5' : ''}`}>
        {buckets.filter(b => b.days > 0).map(b => (
          <span
            key={b.level}
            data-level={b.level}
            style={{ flexGrow: b.days, flexBasis: 0 }}
            className={`block min-w-0 self-stretch first:rounded-l-full last:rounded-r-full ${LEAVE_CAPACITY_STATES[Math.min(b.level, 3)].fill}`}
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
              <span className="tabular-nums">{legend[b.level]} · {b.days} {b.days === 1 ? 'day' : 'days'}</span>
            </li>
          )
        })}
      </ul>
      {total === 0 && <p className="mt-1 text-[11px] text-ink-muted">No days in range.</p>}
    </div>
  )
}
