// Shared destructive-bulk-delete confirmation, used by both "Clear weekend"
// and "Clear month" — same visual template as WeekendPasteModal/
// WeekendDriftDetailsModal above. No undo, so this always requires an
// explicit confirm click; entryCount is the caller's own pre-computed count
// (how many weekend_planner_entries rows this specific action would delete).
export default function WeekendClearConfirmModal({ title, entryCount, saving, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center scrim sm:items-center sm:px-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>
        <p className="mt-3 text-sm text-ink">
          This removes {entryCount} assignment{entryCount === 1 ? '' : 's'}. This can&rsquo;t be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || entryCount === 0}
            className="btn-danger text-sm"
          >
            {saving ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </div>
    </div>
  )
}
