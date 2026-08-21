// Shared all-caps group label above a grouped card/list, e.g. "DRAFTS (2)".
// Same visual weight Account's own settings groups ("CONTACT DETAILS",
// "SECURITY & ACCESS") already used before this was extracted into a
// shared component. See docs/design/layout-spec.md §6.
// Flush left, no horizontal padding — nothing that follows it (the body
// text, cards, or lists every consumer stacks underneath) carries a
// matching left offset, so a padded label here just reads as indented
// against them.
export default function SectionLabel({ children, count, className = '' }) {
  return (
    <p className={`mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted ${className}`}>
      {children}
      {typeof count === 'number' && ` (${count})`}
    </p>
  )
}
