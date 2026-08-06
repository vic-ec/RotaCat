// Shared page-level header — every page gets exactly one, at the very top
// of its content column. See docs/design/layout-spec.md §3.
//
// `action`: the page's one primary create/add action, if it has one —
// `{ label, icon, onClick, disabled }`. Omit entirely on pages without a
// single clear primary action rather than adding a decorative one.
//
// Mobile: H1 drops to text-xl (~20px, spec's "~20-22px"); the action
// button collapses to icon-only (label hidden via `hidden md:inline`) below
// `md` rather than promoting to a floating action button — there's no FAB
// pattern anywhere else in the app, and icon-only-on-mobile is already how
// every other label+icon control shrinks here (e.g. the Staff toolbar's
// Sort/Filter buttons), so this reuses that existing pattern app-wide
// rather than introducing a second one (§15 asks for exactly one).
//
// `badge`: optional attention-needed count shown inline next to the title
// (e.g. a page-level "N need review" count) — not for general totals.
export default function PageHeader({ title, badge, action }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-xl font-bold text-ink md:text-2xl">{title}</h1>
        {badge > 0 && (
          <span
            className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-flagRed px-1.5 text-xs font-semibold text-white"
            aria-label={`${badge} need attention`}
          >
            {badge}
          </span>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.label}
          title={action.label}
          className="btn-primary h-[42px] flex-shrink-0 justify-center whitespace-nowrap md:h-auto md:w-auto"
        >
          {action.icon}
          <span className="hidden md:inline">{action.label}</span>
        </button>
      )}
    </div>
  )
}
