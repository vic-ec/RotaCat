// Two-way (or more) segmented view switch — sized to match the 30px
// controls in a Search/Sort/Filter toolbar row rather than a header's own
// line-height. `options`: [{ key, label, icon? }] — `icon` (a component,
// e.g. lucide's `List`) is optional; when given, the label hides below
// `sm` so this doesn't crowd out a narrow-phone search box sitting next to
// it (same reasoning as ToolbarFacet's own responsive label) — icon stays
// visible at every width, label comes back at `sm` and up. Both are always
// in the DOM; only CSS decides which shows, so there's no separate mobile/
// desktop variant to keep in sync. Extracted from InternRotationsPlanner.jsx's
// Table/Timeline toggle so other pages (e.g. RosterDashboardPage's
// List/Grid switch) can reuse the same shape instead of a second hand-
// rolled copy.
export default function ViewToggle({ view, onChange, options }) {
  return (
    <div className="flex h-[30px] flex-shrink-0 overflow-hidden rounded border border-slate-line bg-canvas-raised">
      {options.map(o => {
        const Icon = o.icon
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-label={o.label}
            className={`flex items-center gap-1.5 px-3 text-xs font-medium transition-colors ${
              view === o.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
            <span className={Icon ? 'hidden sm:inline' : ''}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
