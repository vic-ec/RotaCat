// Two-way (or more) segmented view switch — sized to match the 30px
// controls in a Search/Sort/Filter toolbar row rather than a header's own
// line-height. `options`: [{ key, label, icon? }] — `icon` (a component,
// e.g. lucide's `List`) is optional; when given, the label hides below
// `sm` so this doesn't crowd out a narrow-phone search box sitting next to
// it (same reasoning as ToolbarFacet's own responsive label) — icon stays
// visible at every width, label comes back at `sm` and up. Both are always
// in the DOM; only CSS decides which shows, so there's no separate mobile/
// desktop variant to keep in sync. `ariaLabel` is for the case where the
// visible label is too terse to speak — the roster's S/M/L text-size switch
// announces "Small text" rather than "S"; everything else just reuses its
// own label. `title` is the optional desktop-hover explainer — free where a
// pointer exists, and never the only way a hint is available, since a tap
// never fires one (see DetailInfoButton). Extracted from InternRotationsPlanner.jsx's
// Table/Timeline toggle so other pages (e.g. RosterDashboardPage's
// List/Grid switch) can reuse the same shape instead of a second hand-
// rolled copy.
// `tight`: a little less side padding below `sm`, for a phone row that has to
// fit several controls. `labelFrom`: the breakpoint at which an icon option's
// word comes back ('sm' by default; 'lg' for a row that is still crowded on
// a tablet).
const LABEL_FROM = { sm: 'hidden sm:inline', lg: 'hidden lg:inline' }

export default function ViewToggle({ view, onChange, options, tight = false, labelFrom = 'sm' }) {
  return (
    <div className="seg-track h-[30px] flex-shrink-0">
      {options.map(o => {
        const Icon = o.icon
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-label={o.ariaLabel ?? o.label}
            title={o.title}
            className={`flex items-center gap-1.5 rounded ${tight || options.some(x => x.shortLabel) ? 'px-2.5 sm:px-3' : 'px-3'} text-xs font-medium transition-colors ${
              view === o.key ? 'seg-on' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
            }`}
          >
            {/* `shortLabel` (e.g. "W" for Week): below `sm` the option shows
                that letter instead of its icon — two calendar glyphs side by
                side are indistinguishable at this size, two letters aren't. */}
            {Icon && <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${o.shortLabel ? 'hidden sm:block' : ''}`} />}
            {o.shortLabel && <span className="sm:hidden" aria-hidden="true">{o.shortLabel}</span>}
            <span className={Icon ? LABEL_FROM[labelFrom] : ''}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
