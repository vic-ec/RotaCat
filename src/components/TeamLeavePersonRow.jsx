import Tag from './Tag'
import { LEAVE_TYPE_LABELS, LEAVE_GROUP_COLOR, leaveTypeGroupKey } from '../lib/leaveMatrix'
import { naturalLeavePeriodLabel } from '../lib/leaveRequests'
import { labelForLeaveCategory } from '../lib/leaveYearGrid'

// One leave, as a tappable row: name (primary), category (supporting text —
// not a pill), the leave type with a colour dot, the date range, and a status
// Tag only when the leave isn't approved (status never conveyed by colour
// alone). Shared by the Week view, the Month day-sheet, and the People person-
// sheet. `showName={false}` drops the name when the surrounding sheet is
// already titled with it. ~44px min tap target.
export default function TeamLeavePersonRow({ request, onSelect, showName = true }) {
  const doctor = request.profiles || {}
  const name = `${doctor.name || ''} ${doctor.surname || ''}`.trim() || 'Unknown'
  const category = doctor.category ? labelForLeaveCategory(doctor.category, doctor.contract_type) : null
  const color = LEAVE_GROUP_COLOR[leaveTypeGroupKey(request.leave_type)]
  const typeLabel = LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type

  return (
    <button
      type="button"
      onClick={() => onSelect?.(request)}
      className="flex w-full items-center gap-3 rounded-lg border border-slate-line bg-canvas-raised px-3 py-2 text-left transition-colors hover:bg-canvas-sunken"
      style={{ minHeight: 44 }}
    >
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {showName && <span className="block truncate text-sm font-medium text-ink">{name}</span>}
        <span className="block truncate text-xs text-ink-muted">{category ? `${category} · ` : ''}{typeLabel}</span>
      </span>
      <span className="flex flex-shrink-0 flex-col items-end gap-1">
        <span className="whitespace-nowrap text-xs text-ink-light">{naturalLeavePeriodLabel(request.date_from, request.date_to)}</span>
        {request.status !== 'approved' && (
          <Tag variant="status" tone="warning">{request.status.charAt(0).toUpperCase() + request.status.slice(1)}</Tag>
        )}
      </span>
    </button>
  )
}
