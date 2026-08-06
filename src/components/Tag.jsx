// Shared pill — role/category tags and status tags are kept as two
// structurally separate variants (not just a color prop) so a category
// label (Registrar, Consultant) can never land on the same palette as a
// status label (Draft, Published, Rejected) by accident — that mix-up on
// the Staff and Roster pages is exactly what this component replaces.
// See docs/design/layout-spec.md §9.
//
// Shape: kept at the app's existing `rounded-full` pill (not the spec's
// literal 6px-radius rectangle) — every tag/badge already shipped in the
// app (Roster's Draft/Published, Staff's Locum/Clerk badges, leave-request
// status pills, …) is fully rounded, so matching that is what actually
// makes tags read as "the same everywhere"; a squarer shape on just these
// three pages would make the app less consistent, not more.
const STATUS_TONE_CLASS = {
  success: 'bg-success-bg text-success',
  warning: 'bg-flagAmber-bg text-flagAmber',
  danger: 'bg-flagRed-bg text-flagRed',
  neutral: 'bg-canvas-sunken text-ink-muted',
}

// Role/category tags are always this one neutral pairing — already the
// app's existing convention for Locum/Clerk badges — never a prop, so
// there's no way to hand a role tag a status color.
const ROLE_CLASS = 'bg-canvas-sunken text-ink-muted'

export default function Tag({ variant = 'role', tone = 'neutral', children, className = '' }) {
  const paletteClass = variant === 'status' ? (STATUS_TONE_CLASS[tone] || STATUS_TONE_CLASS.neutral) : ROLE_CLASS
  return (
    <span className={`inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${paletteClass} ${className}`}>
      {children}
    </span>
  )
}
