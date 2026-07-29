import ClearableInput from './ClearableInput'

// Doctor picker popover — search by name, pick to assign, optional "Remove
// from this slot" footer. Extracted from RosterGridPage so the Phase 5
// removal-workflow modal's "swap" step can reuse it as-is.
export default function DoctorDropdown({ profiles, search, onSearchChange, onSelect, onRemove, onClose, date, shiftCode }) {
  const filtered = profiles.filter(p =>
    `${p.name} ${p.surname}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-xs p-0 shadow-raised overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-line px-3 py-2.5">
          <p className="text-xs font-medium text-ink-muted mb-1.5">
            Assign doctor — {shiftCode} on {date}
          </p>
          <ClearableInput
            autoFocus
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search by name…"
            className="input-field text-sm py-1.5"
            clearLabel="Clear search"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-3 py-3 text-sm text-ink-muted">No doctors found.</p>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
            >
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: p.color_code }}
              />
              <span className="font-medium text-ink">{p.surname}</span>
              <span className="text-xs text-ink-muted capitalize">{p.category}</span>
            </button>
          ))}
        </div>
        {onRemove && (
          <div className="border-t border-slate-line px-3 py-2">
            <button
              onClick={onRemove}
              className="w-full rounded py-1.5 text-sm text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg"
            >
              Remove from this slot
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
