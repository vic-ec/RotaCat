// The post-action Undo toast, shared by the Weekend Planner and the roster.
// Dark, bottom of the screen, one line and an Undo. Clears the phone's
// bottom nav (54px of bar plus the home-indicator inset plus a gap, the
// same offset the FAB uses) and, when the page has its own bar down there
// (the roster's edit bar), sits above that too via `bottomClassName`.
// From md up it sits at the usual 16px, bottom left or centred as the
// page asks.
export default function UndoToast({
  label, onUndo, onDismiss, undoing = false,
  bottomClassName = 'bottom-[calc(70px+env(safe-area-inset-bottom))] md:bottom-4',
  align = 'center',
}) {
  const place = align === 'left'
    ? 'left-1/2 -translate-x-1/2 md:left-4 md:translate-x-0'
    : 'left-1/2 -translate-x-1/2'
  return (
    <div
      role="status"
      data-testid="undo-toast"
      className={`fixed ${bottomClassName} ${place} z-50 flex w-[calc(100vw-2rem)] items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-canvas shadow-lg md:w-auto md:max-w-md`}
    >
      <span className="min-w-0 flex-1">{label}</span>
      <button
        type="button"
        onClick={onUndo}
        disabled={undoing}
        className="min-h-[44px] flex-shrink-0 px-1 font-semibold text-accent-tint hover:text-white disabled:opacity-60 md:min-h-0"
      >
        {undoing ? 'Undoing…' : 'Undo'}
      </button>
      <button type="button" onClick={onDismiss} className="flex-shrink-0 text-white/60 hover:text-white" aria-label="Dismiss">×</button>
    </div>
  )
}
