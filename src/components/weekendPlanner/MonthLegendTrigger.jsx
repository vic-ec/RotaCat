import LegendSheet from '../LegendSheet'
import { WEEKEND_RULE_BULLETS } from '../../lib/weekendPlanner'

// The month view's Legend — a live-count chip (real numbers, not a static
// swatch key, since "how many gaps right now" is worth surfacing without
// opening anything) shared by both viewports rather than each rolling its
// own. Doubles as the "How it works" entry point via LegendSheet's footer,
// replacing the separate Info icon each viewport used to render alongside
// this — one trigger, not two.
export default function MonthLegendTrigger({ counts, triggerClassName }) {
  return (
    <LegendSheet
      ruleBullets={WEEKEND_RULE_BULLETS}
      trigger={onClick => (
        <button type="button" onClick={onClick} aria-label="Legend and how it works" className={triggerClassName}>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />{counts.complete} planned</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-flagAmber" />{counts.open} need staff</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-flagRed" />{counts.empty} empty</span>
        </button>
      )}
    >
      <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-success" /> Fully planned</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-flagAmber" /> Needs staff</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-flagRed" /> Empty</span>
      </div>
    </LegendSheet>
  )
}
