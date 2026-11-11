import { capacityStateForCount } from '../lib/leaveYearGrid'

// Three small rounded squares — one per leave slot on a day. Filled pips
// take the day's capacity state colour (the same four-state scale as every
// other capacity read: 0, 1, 2, 3+ used = green, yellow, orange, red);
// unfilled pips are outlined — green when nobody is out at all, grey once
// the day has started filling. Past `max` the extra doctors are counted
// out as "+N" rather than drawn, so an over-capacity day still reads at a
// glance. Colour is never the only signal: the whole group carries an
// aria-label in words, and the details card spells the count out too.
// `label` overrides that wording where the number means something else
// (Special's guideline rather than a slot).
export default function SlotPips({ used, max = 3, label, size = 'sm', className = '' }) {
  const state = capacityStateForCount(used)
  const filled = Math.min(used, max)
  const over = Math.max(0, used - max)
  const pip = size === 'lg' ? 'h-2.5 w-2.5' : 'h-2 w-2'
  const aria = label ?? (over > 0 ? `${used} on leave, ${max} slots` : `${used} of ${max} slots used`)

  return (
    <span role="img" aria-label={aria} className={`inline-flex items-center gap-0.5 ${className}`}>
      {Array.from({ length: max }, (_, i) => (
        i < filled
          ? <span key={i} className={`${pip} rounded-[3px] ${state.fill}`} />
          : <span key={i} className={`${pip} rounded-[3px] ring-1 ring-inset ${used === 0 ? 'ring-capAvailable' : 'ring-ink-muted/50'}`} />
      ))}
      {over > 0 && <span className="ml-0.5 text-[10px] font-semibold leading-none text-capAtCapacity-ink">+{over}</span>}
    </span>
  )
}
