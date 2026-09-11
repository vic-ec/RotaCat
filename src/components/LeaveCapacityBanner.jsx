import { bannerStateForSlots } from '../lib/monthWorkspace'
import { LEAVE_FULL_TIME_POOL_LABEL } from '../lib/leaveYearGrid'

// The "can I actually get annual leave here" banner — extracted from
// MonthWorkspace's DayReviewModal so it and LeaveRequestForm's capacity
// preview render from one place and can never drift apart: same numbers,
// same colours, same copy, regardless of which screen is asking.
//
// Two shapes, matching the two callers:
//   - `mySlots` present ({ taken, max } for the viewer's own capacity
//     pool on the worst date in view) -> the personalised banner, with
//     `columnLabel` naming that pool ("MO", "OT Intern", etc). `pooled`
//     (true for MO/Registrar/EC Intern) means `taken`/`max` are the shared
//     full-time pool's count, not this column's own — named explicitly
//     (LEAVE_FULL_TIME_POOL_LABEL) so "0 available" doesn't read as "EC
//     Intern's own quota is full" when it's really a doctor from a
//     different pooled category who filled it.
//   - `mySlots` null/undefined -> falls back to the generic cross-
//     category banner (DayReviewModal only — a viewer with no capacity
//     column, e.g. Consultant/admin). It reports every state, not just the
//     full one: a day showing nothing at all read as "no capacity rule
//     here" rather than "two of three slots are already gone", which is the
//     single most useful thing to know before asking for the day.
//     LeaveRequestForm never hits this branch, since its own preview never
//     sets mySlots without a resolvable column in the first place.
export default function LeaveCapacityBanner({
  mySlots, columnLabel, pooled, atFullCapacity, dayCapacityState, totalSlots, totalCeiling,
}) {
  if (mySlots) {
    const available = mySlots.max - mySlots.taken
    const state = bannerStateForSlots(mySlots)
    return (
      <div className={`mb-3 flex items-start gap-2 rounded-lg p-3 ring-1 ring-inset ${state.tint} ${state.ringDark}`}>
        <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${state.dark}`}>
          {available <= 0 ? '✕' : available === mySlots.max ? '✓' : '!'}
        </span>
        <div>
          <p className={`text-sm font-bold ${state.text}`}>
            {mySlots.taken} of {mySlots.max} slot{mySlots.max !== 1 ? 's' : ''} taken
          </p>
          {pooled ? (
            <p className="mt-0.5 text-xs text-ink-muted">
              {available} leave slot{available !== 1 ? 's' : ''} available in the shared pool: {LEAVE_FULL_TIME_POOL_LABEL}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-muted">
              {available} leave slot{available !== 1 ? 's' : ''} available for {columnLabel}
            </p>
          )}
        </div>
      </div>
    )
  }

  // No personal pool and no day state to fall back on — nothing truthful to
  // say. LeaveRequestForm never lands here (it always passes mySlots), but a
  // caller that did would otherwise crash on a missing state.
  if (!dayCapacityState) return null

  const remaining = Math.max(0, totalCeiling - totalSlots)
  return (
    <div className={`mb-3 flex items-start gap-2 rounded-lg p-3 ring-1 ring-inset ${dayCapacityState.tint} ${dayCapacityState.ringDark}`}>
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${dayCapacityState.dark}`}>
        {atFullCapacity ? '✕' : totalSlots === 0 ? '✓' : '!'}
      </span>
      <div>
        <p className={`text-sm font-bold ${dayCapacityState.text}`}>
          {atFullCapacity ? 'Full — ' : ''}{totalSlots} of {totalCeiling} slots taken
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {atFullCapacity
            ? 'No annual leave slots available for any category today.'
            : `${remaining} annual leave slot${remaining !== 1 ? 's' : ''} available across all doctor categories.`}
        </p>
      </div>
    </div>
  )
}
