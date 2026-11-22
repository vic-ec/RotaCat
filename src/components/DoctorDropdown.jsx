import { useEffect } from 'react'
import { X } from 'lucide-react'
import ClearableInput from './ClearableInput'
import { useSwatch } from '../lib/useSwatch'

// Doctor picker popover — search by name, pick to assign, optional remove
// footer whose label names what is removed (`removeLabel`; the roster's
// shift cells pass no onRemove at all — their removes live in ShiftMenu). Extracted from RosterGridPage so the Phase 5
// removal-workflow modal's "swap" step can reuse it as-is. `displayNames`
// (buildDoctorDisplayNames' Map<profileId, label>) is optional — pass it
// whenever `profiles` might contain a same-surname collision, so the row
// label disambiguates ("J. Nolan") instead of the bare surname.
//
// Locums are opt-in, for the roster only: pass `onSelectCover` and the list
// gains a Locums section (`locums` with an account, `contacts` without
// one yet) and, with `onNewLocum`, a "New locum" action. onSelectCover
// receives a cover object (see lib/locumCover.js) for a locum pick; a
// doctor pick still goes to onSelect(profileId), so every other caller is
// untouched.
export default function DoctorDropdown({ profiles, displayNames, search, onSearchChange, onSelect, onRemove, removeLabel = 'Remove', onClose, date, shiftCode, locums = [], contacts = [], onSelectCover = null, onNewLocum = null }) {
  const swatch = useSwatch()
  const matches = p => `${p.name} ${p.surname}`.toLowerCase().includes(search.toLowerCase())
  const filtered = profiles.filter(matches)
  const locumRows = onSelectCover
    ? [
      ...locums.filter(matches).map(p => ({ key: p.id, cover: { kind: 'locum', id: p.id, name: `${p.name} ${p.surname}`.trim(), surname: p.surname }, hint: 'Locum' })),
      ...contacts.filter(matches).map(p => ({ key: p.id, cover: { kind: 'contact', id: p.id, name: `${p.name} ${p.surname}`.trim(), surname: p.surname }, hint: 'Locum · no account yet' })),
    ]
    : []

  // Escape closes it, like every other dismissable layer in the app.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center scrim px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Assign doctor — ${shiftCode} on ${date}`}
        className="card w-full max-w-xs p-0 shadow-raised overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-line px-3 py-2.5">
          {/* Explicit close as well as the backdrop and Escape: on a phone
              the backdrop either side of a max-w-xs card is a thin strip,
              and there is nothing on screen that says tapping it does
              anything. */}
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-ink-muted">
              Assign doctor — {shiftCode} on {date}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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
          {filtered.length === 0 && locumRows.length === 0 && (
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
                style={swatch.fill(p.color_code)}
              />
              <span className="font-medium text-ink">{displayNames?.get(p.id) ?? p.surname}</span>
              <span className="text-xs text-ink-muted capitalize">{p.category}</span>
            </button>
          ))}
          {locumRows.length > 0 && (
            <p className="border-t border-slate-line bg-canvas-sunken px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Locums</p>
          )}
          {locumRows.map(row => (
            <button
              key={row.key}
              onClick={() => onSelectCover(row.cover)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
            >
              <span className="h-3 w-3 flex-shrink-0 rounded-full border border-dashed border-flagAmber bg-flagAmber-bg" />
              <span className="font-medium text-ink">{row.cover.name}</span>
              <span className="text-xs text-ink-muted">{row.hint}</span>
            </button>
          ))}
        </div>
        {onNewLocum && (
          <div className="border-t border-slate-line px-3 py-2">
            <button
              onClick={onNewLocum}
              className="w-full rounded py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-light active:bg-accent-light"
            >
              + New locum
            </button>
          </div>
        )}
        {onRemove && (
          <div className="border-t border-slate-line px-3 py-2">
            <button
              onClick={onRemove}
              className="w-full rounded py-1.5 text-sm text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg"
            >
              {removeLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
