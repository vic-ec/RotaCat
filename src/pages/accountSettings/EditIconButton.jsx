import { ChevronDown as ChevronDownIcon } from 'lucide-react'

// Small icon button — used for the header's "edit profile details" trigger
// (chevron, up-when-closed/down-when-open — a deliberate reversal of the
// usual "points toward where content expands" convention, matching the
// SectionRow accordions elsewhere on the page) and for each Contact row's
// edit action
// (a static pencil — editing a single value rather than expanding a
// section, so it doesn't need the open/closed rotation). Sized to a 24x24
// hit area (WCAG 2.5.8's AA minimum) rather than a full 44px target, so it
// doesn't force these rows taller than the plain-text SectionRow rows below
// them.
export default function EditIconButton({ label, expanded, onClick, icon: Icon = ChevronDownIcon, className = '' }) {
  const isChevron = Icon === ChevronDownIcon
  return (
    <button
      type="button"
      // The whole row around this is clickable too (see ContactRow and the
      // profile header): without stopping here, a tap on the icon would run
      // the toggle twice and land back where it started.
      onClick={e => { e.stopPropagation(); onClick(e) }}
      aria-label={label}
      aria-expanded={expanded}
      className={`flex flex-shrink-0 items-center justify-center rounded p-1 text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      <Icon className={`h-4 w-4 ${isChevron ? `transition-transform ${expanded ? '' : 'rotate-180'}` : ''}`} />
    </button>
  )
}
