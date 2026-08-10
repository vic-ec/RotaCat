// Small "who" pill — a colour dot (matching DoctorDropdown's row styling)
// plus surname, with an optional remove affordance. Shared by any admin
// view that needs to show a doctor as a compact chip rather than a full
// row (e.g. InternRotationsPlanner's timeline view). `displayNames`
// (buildDoctorDisplayNames' Map<profileId, label>) is optional — pass it
// whenever the caller's doctor pool might have a same-surname collision, so
// the label disambiguates ("J. Naidoo") instead of falling back to the bare
// surname.
export default function DoctorChip({ profile, displayNames, onRemove }) {
  const label = (profile && displayNames?.get(profile.id)) ?? profile?.surname ?? '?'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-sunken px-2 py-0.5 text-xs font-medium text-ink">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: profile?.color_code || '#94a3b8' }}
      />
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="text-ink-muted hover:text-flagRed"
        >
          ×
        </button>
      )}
    </span>
  )
}
