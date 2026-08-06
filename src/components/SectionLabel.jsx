// Shared all-caps group label above a grouped card/list, e.g. "DRAFTS (2)".
// Same visual weight Account's own settings groups ("CONTACT DETAILS",
// "SECURITY & ACCESS") already used before this was extracted into a
// shared component. See docs/design/layout-spec.md §6.
export default function SectionLabel({ children, count, className = '' }) {
  return (
    <p className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted ${className}`}>
      {children}
      {typeof count === 'number' && ` (${count})`}
    </p>
  )
}
