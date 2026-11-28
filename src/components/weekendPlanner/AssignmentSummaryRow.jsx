import { CircleCheck, CircleAlert } from 'lucide-react'

// One category's read-only summary row for the desktop inspector's default
// (non-editing) view: label, comma-joined surnames or an "Open" chip, and a
// status icon — no buttons. Editing lives behind the "Edit assignments"
// action instead of always-visible +/x controls, per a desktop UX review
// ("quick actions only on hover/select, not always-visible plus icons
// everywhere").
export default function AssignmentSummaryRow({ group, groupEntries, doctorById, displayNames }) {
  const filled = groupEntries.length > 0
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-ink-muted">{group.label}</span>
      <div className="flex items-center gap-2">
        {filled ? (
          <span className="text-right text-sm text-ink">
            {groupEntries.map(e => displayNames.get(e.profile_id) ?? doctorById.get(e.profile_id)?.surname ?? '(unknown)').join(', ')}
          </span>
        ) : (
          <span className="rounded-full bg-flagAmber-bg px-2 py-0.5 text-xs font-medium text-flagAmber">Open</span>
        )}
        {filled
          ? <CircleCheck className="h-4 w-4 flex-shrink-0 text-success" />
          : <CircleAlert className="h-4 w-4 flex-shrink-0 text-flagAmber" />}
      </div>
    </div>
  )
}
