import { leaveTypeInk } from '../../lib/leaveMatrix'
import { leaveTypeCode } from '../../lib/leaveRequests'

// A leave type's short code in a small box, in its group's colour — always
// shown beside the full label, so the colour is never the only signal.
export default function LeaveCodeBox({ leaveType, className = '' }) {
  const tone = leaveTypeInk(leaveType)
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-5 min-w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] border px-1 text-[10px] font-bold leading-none ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`,
        color: tone,
      }}
    >
      {leaveTypeCode(leaveType)}
    </span>
  )
}
