// Shared "page tabs" template — underlined primary navigation within a
// page (Leave Planner's My leave/Team/Planners/Rules row is the reference
// implementation this was extracted from). Active tab gets an accent
// underline plus bold text; inactive tabs sit flush against the shared
// bottom border. Scrolls horizontally instead of wrapping if the row
// doesn't fit, and each tab can carry an optional numeric badge (e.g. a
// pending-count) rendered as a small pill after its label. Badge colour
// defaults to the brand accent; pass `badgeColor: 'red'` for a count that
// specifically needs admin attention/review (matching the bottom-nav
// badge's own red — see NavBadge in AppLayout.jsx) rather than a routine
// informational count.
//
// `size="sub"` is the smaller nested-tab variant (Leave Planner's own
// Planners sub-tabs) — same mechanics, lighter weight/size.
export default function PageTabs({ tabs, active, onChange, ariaLabel, size = 'default' }) {
  const isSub = size === 'sub'
  return (
    <nav
      className={`flex overflow-x-auto border-b border-slate-line ${isSub ? 'gap-5' : 'gap-6'}`}
      aria-label={ariaLabel}
    >
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 transition-colors ${
            isSub ? 'pb-1.5 text-xs' : 'pb-2.5 text-sm'
          } ${
            active === t.key ? 'border-accent font-semibold text-ink' : 'border-transparent font-medium text-ink-light hover:text-ink'
          }`}
        >
          {t.label}
          {t.badge > 0 && (
            <span className={`flex h-4 min-w-[16px] flex-shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${
              t.badgeColor === 'red' ? 'bg-flagRed' : 'bg-accent'
            }`}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
