// Two-way (or more) segmented view switch — sized to match the 30px
// controls in a Search/Sort/Filter toolbar row rather than a header's own
// line-height. `options`: [{ key, label }]. Extracted from
// InternRotationsPlanner.jsx's Table/Timeline toggle so other pages (e.g.
// RosterDashboardPage's List/Grid switch) can reuse the same shape instead
// of a second hand-rolled copy.
export default function ViewToggle({ view, onChange, options }) {
  return (
    <div className="flex h-[30px] flex-shrink-0 overflow-hidden rounded border border-slate-line bg-canvas-raised">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-3 text-xs font-medium transition-colors ${
            view === o.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
