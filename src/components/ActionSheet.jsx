// Shared bottom-sheet action-list shell — fixed inset-0, scrim,
// items-end on mobile / items-center on desktop, rounded-b-none
// sm:rounded-b-lg — for short action lists (per-card ⋮ menus, page-level
// overflow menus, confirmation sheets) so there's one sheet pattern instead
// of several ad hoc ones. The card itself is capped at 80vh with its own
// scrollable body (title stays pinned) — content that's short never
// notices, but taller content (e.g. DateStepper's 12-month jump grid) would
// otherwise keep growing past the bottom of the screen, right behind the
// fixed bottom nav bar, with no way to reach whatever's hidden under it.
// `pointer-events-auto` is not redundant: this sheet is sometimes rendered
// from inside a `pointer-events-none` subtree (FloatingActionMenu's stack,
// which gives up pointer events so its collapsed layout box can't swallow
// taps), and pointer-events inherits. Without it the backdrop can't receive
// its own dismiss click and taps fall straight through to the page behind —
// the sheet reads as stuck open over a still-interactive page.
// `onBack`, when given, puts a back chevron before the title — for a sheet
// that swaps its own body for a sub-list (PageActionsMenu's Font size, and
// the same shape DateStepper's jump sheet uses to swap months for years)
// rather than stacking a second sheet on top of the first, which on a phone
// buries the one underneath.
export function ActionSheet({ title, onBack, onClose, children }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center scrim sm:items-center sm:px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card flex max-h-[80vh] w-full max-w-sm flex-col rounded-b-none border-edge p-2 sm:rounded-b-lg"
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex flex-shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken hover:text-ink"
              >
                <BackIcon className="h-4 w-4" />
              </button>
            )}
            <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken hover:text-ink"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="min-h-0 divide-y divide-slate-line overflow-y-auto pb-[max(env(safe-area-inset-bottom),8px)]">{children}</div>
      </div>
    </div>
  )
}

function BackIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function CloseIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// `trailing` is for a row that carries something on its right — the current
// value and a chevron on a row that opens a sub-list. Without it the label
// stays inline next to the icon exactly as before, so every existing row is
// untouched.
export function ActionSheetButton({ icon, danger, disabled, onClick, trailing, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-3 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-flagRed hover:bg-flagRed-bg' : 'text-ink hover:bg-canvas-sunken'
      }`}
    >
      {icon}
      {trailing ? <><span className="min-w-0 flex-1 truncate">{children}</span>{trailing}</> : children}
    </button>
  )
}
