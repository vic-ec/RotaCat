import { CalendarSearch, TriangleAlert } from 'lucide-react'
import SectionLabel from './SectionLabel'
import { capacityAssessmentState } from '../lib/leaveRequests'
import { LEAVE_FULL_TIME_POOL_LABEL } from '../lib/leaveYearGrid'

const ASSESSMENT_HEADING = {
  available: 'Capacity available',
  limited: 'Limited capacity',
  at_capacity: 'At capacity',
}

// The annual-leave slot gauge — one of 3 named, distinctly-colored states
// (never color alone: the heading text always spells out the state too).
// `preview` is a fetchAnnualCapacityPreview() result: { taken, max, pooled,
// columnLabel }.
// The request under review always occupies exactly one slot in its own
// capacity column (headcount-based — one doctor = one slot, regardless of
// how many days it spans), so the numerator on the "reserved" line is
// always the literal 1, not preview.taken (which is the pool-wide count,
// this request included). Leading with that fact — rather than an
// unexplained "X of Y taken" — is what tells a reviewer the slot they're
// looking at IS this request, not some other doctor's; "Who is already
// away" below is what accounts for anyone else.
function SlotGauge({ preview }) {
  const state = capacityAssessmentState(preview)
  const remaining = preview.max - preview.taken
  const slotWord = preview.max === 1 ? 'slot' : 'slots'
  const poolNote = preview.pooled ? `shared pool: ${LEAVE_FULL_TIME_POOL_LABEL}` : `for ${preview.columnLabel}`

  return (
    <div className={`rounded-lg p-3 ${state.tint}`}>
      <p className={`text-sm font-bold ${state.text}`}>{ASSESSMENT_HEADING[state.key]}</p>
      <p className="mt-0.5 text-xs text-ink-light">
        1 of {preview.max} leave {slotWord} is reserved for this request.
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {remaining} of {preview.max} {slotWord} left — {poolNote}.
      </p>
    </div>
  )
}

// "Requires review" — the existing Tier-2 approval warnings (supervision
// floor, annual-leave balance, five-eighths hour ceiling), reframed as
// policy exceptions the admin must consciously acknowledge rather than a
// generic "conflicts" alert. Red, not amber, per the redesign's color rule:
// amber is reserved for genuine caution/limited-capacity, red for
// at-capacity, a blocked request, or a genuine rule exception — and a Tier-2
// warning IS a rule exception being knowingly overridden.
function RequiresReview({ warnings }) {
  return (
    <div className="rounded-lg bg-danger-bg p-3">
      <p className="text-sm font-bold text-danger">Requires review</p>
      <div className="mt-1.5 space-y-1.5">
        {warnings.supervisionBreaches.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-danger">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            Approving would drop supervision below the required minimum on {warnings.supervisionBreaches.length} shift{warnings.supervisionBreaches.length !== 1 ? 's' : ''}.
          </p>
        )}
        {warnings.balanceWarnings.map(bw => (
          <p key={bw.year} className="flex items-start gap-1.5 text-xs text-danger">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {bw.year} annual leave balance would go negative ({bw.remainingAfter} of {bw.daysAllotted} days remaining).
          </p>
        ))}
        {warnings.hourCeilingWarning && (
          <p className="flex items-start gap-1.5 text-xs text-danger">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            Five-eighths doctor already has {warnings.hourCeilingWarning.alreadyRosteredHours}h rostered this month (ceiling: {warnings.hourCeilingWarning.maxHours}h).
          </p>
        )}
      </div>
    </div>
  )
}

// Decision-led capacity section — replaces the old generic "Conflicts in
// the planner" warning card. `capacityPreview` null (query resolved, no
// capacity column applies — most non-annual leave, or an Other-column
// category) renders a plain neutral line, never a colored panel: an
// "available" tint with nothing to actually assess would misread as a
// status claim about a category this request doesn't even draw from.
export default function CapacityAssessment({
  capacityPreview, capacityLoading, warnings, warned, warningsLoading, onViewCalendar,
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel className="mb-0 leading-none">Capacity assessment</SectionLabel>
        {/* The icon, not the line-height, was the remaining misalignment:
            at h-3.5 (14px) it was taller than the text-xs+leading-none
            label next to it (12px), so the button's own rendered height
            exceeded the label's — items-center on the row then centered
            two different-height boxes, leaving a residual few-px offset
            even with both line-heights forced to 1. h-3/w-3 (12px) matches
            the label's line-height exactly, so both elements render at the
            identical height and truly share one vertical center. */}
        <button
          type="button"
          onClick={onViewCalendar}
          className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium leading-none text-accent hover:underline"
        >
          <CalendarSearch className="h-3 w-3" /> View calendar
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {capacityLoading ? (
          <p className="text-xs text-ink-muted">Checking capacity…</p>
        ) : capacityPreview ? (
          <SlotGauge preview={capacityPreview} />
        ) : (
          <p className="text-xs text-ink-muted">No leave-slot limit applies to this category/leave type.</p>
        )}

        {warningsLoading ? (
          <p className="text-xs text-ink-muted">Checking for other conflicts…</p>
        ) : warned && <RequiresReview warnings={warnings} />}
      </div>
    </div>
  )
}
