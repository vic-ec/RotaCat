import { bannerStateForSlots } from '../lib/monthWorkspace'

// The "can I actually get annual leave here" banner — extracted from
// MonthWorkspace's DayReviewModal so it and LeaveRequestForm's capacity
// preview render from one place and can never drift apart: same numbers,
// same colours, same copy, regardless of which screen is asking.
//
// Two shapes, matching the two callers:
//   - `mySlots` present ({ taken, max } for the viewer's own capacity
//     pool on the worst date in view) -> the personalised banner, with
//     `columnLabel` naming that pool ("MO", "OT COSMO / Intern", etc).
//   - `mySlots` null/undefined -> falls back to the generic cross-
//     category banner (DayReviewModal only — a viewer with no capacity
//     column, e.g. Consultant/admin), shown only once `atFullCapacity`;
//     otherwise renders nothing. LeaveRequestForm never hits this branch,
//     since its own preview never sets mySlots without a resolvable
//     column in the first place.
export default function LeaveCapacityBanner({
  mySlots, columnLabel, atFullCapacity, dayCapacityState, totalSlots, totalCeiling,
}) {
  if (mySlots) {
    const available = mySlots.max - mySlots.taken
    const state = bannerStateForSlots(mySlots)
    return (
      <div className={`mb-3 flex items-start gap-2 rounded-lg p-3 ${state.tint}`}>
        <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${state.dark}`}>
          {available <= 0 ? '✕' : available === mySlots.max ? '✓' : '!'}
        </span>
        <div>
          <p className={`text-sm font-bold ${state.text}`}>
            {mySlots.taken} of {mySlots.max} slot{mySlots.max !== 1 ? 's' : ''} taken
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {available} leave slot{available !== 1 ? 's' : ''} available for {columnLabel}
          </p>
        </div>
      </div>
    )
  }

  if (!atFullCapacity) return null
  return (
    <div className={`mb-3 flex items-start gap-2 rounded-lg p-3 ${dayCapacityState.tint}`}>
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${dayCapacityState.dark}`}>✕</span>
      <div>
        <p className={`text-sm font-bold ${dayCapacityState.text}`}>Full — {totalSlots} of {totalCeiling} slots taken</p>
        <p className="mt-0.5 text-xs text-ink-muted">No annual leave slots available for any category today.</p>
      </div>
    </div>
  )
}
