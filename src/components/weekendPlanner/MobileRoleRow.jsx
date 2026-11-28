import { Plus } from 'lucide-react'

// One role row on the mobile card (Part 3/5) — label left, value right,
// divider between rows (the parent's own divide-y). An unfilled role is a
// tappable amber "Open" pill (opens the doctor-add sheet, scoped to this
// weekend+group); an assigned doctor's name is itself tappable (opens the
// single-action "Remove from this weekend" sheet). A filled row still gets a
// small "+" trigger alongside the names — a category routinely holds 2-4
// doctors (e.g. 3-4 MOs on rotation together), and the "Open" pill alone
// only ever covered the very first name; without this there was no way to
// add a second one short of removing everyone and starting over.
export default function MobileRoleRow({ group, groupEntries, doctorById, displayNames, isAdmin, onOpenPicker, onOpenRemove }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="text-sm text-ink-muted">{group.label}</span>
      {groupEntries.length === 0 ? (
        isAdmin ? (
          <button
            type="button"
            onClick={onOpenPicker}
            className="rounded-full bg-flagAmber-bg px-2.5 py-1 text-xs font-medium text-flagAmber transition-colors hover:opacity-80"
          >
            Open
          </button>
        ) : (
          <span className="rounded-full bg-flagAmber-bg px-2.5 py-0.5 text-xs font-medium text-flagAmber">Open</span>
        )
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          {groupEntries.map(entry => {
            const doctor = doctorById.get(entry.profile_id)
            const name = doctor ? (displayNames.get(doctor.id) ?? doctor.surname) : '(unknown)'
            return isAdmin ? (
              <button
                key={entry.id}
                type="button"
                onClick={() => onOpenRemove(entry)}
                className="text-sm text-ink underline decoration-dotted underline-offset-2 hover:text-accent"
              >
                {name}
              </button>
            ) : (
              <span key={entry.id} className="text-sm text-ink">{name}</span>
            )
          })}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenPicker}
              aria-label={`Add another doctor to ${group.label}`}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent hover:opacity-80"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
