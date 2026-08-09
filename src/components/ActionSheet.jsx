// Shared bottom-sheet action-list shell — fixed inset-0, bg-ink/20,
// items-end on mobile / items-center on desktop, rounded-b-none
// sm:rounded-b-lg — for short action lists (per-card ⋮ menus, page-level
// overflow menus, confirmation sheets) so there's one sheet pattern instead
// of several ad hoc ones.
export function ActionSheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card w-full max-w-sm rounded-b-none p-2 sm:rounded-b-lg"
        onClick={e => e.stopPropagation()}
      >
        {title && <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>}
        <div className="divide-y divide-slate-line">{children}</div>
      </div>
    </div>
  )
}

export function ActionSheetButton({ icon, danger, disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-3 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-flagRed hover:bg-flagRed-bg' : 'text-ink hover:bg-canvas-sunken'
      }`}
    >
      {icon}{children}
    </button>
  )
}
