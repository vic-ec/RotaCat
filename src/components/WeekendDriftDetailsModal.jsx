// Full detail list behind the roster grid's collapsed "Weekend Planner
// updated" alert — every drifted Saturday and who's now/no-longer planned,
// kept out of the banner itself so the banner stays a single line
// regardless of how many weekends have drifted. Also hosts "don't show
// this message again" as a low-emphasis control down here rather than
// beside the banner's primary action, where it competed for attention.
export default function WeekendDriftDetailsModal({ drift, profileMap, driftMuted, onToggleMute, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Weekend Planner changes</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>
        <ul className="mt-4 space-y-3 text-sm text-flagAmber">
          {drift.map(({ saturday, added, removed }) => (
            <li key={saturday}>
              <span className="font-medium">{saturday}:</span>{' '}
              {added.length > 0 && (
                <span>now planned: {added.map(pid => profileMap[pid]?.surname || pid).join(', ')}</span>
              )}
              {added.length > 0 && removed.length > 0 && ' — '}
              {removed.length > 0 && (
                <span>no longer planned: {removed.map(pid => profileMap[pid]?.surname || pid).join(', ')}</span>
              )}
            </li>
          ))}
        </ul>
        <label className="mt-4 flex items-center gap-1.5 border-t border-slate-line pt-3 text-xs text-ink-muted">
          <input type="checkbox" checked={driftMuted} onChange={e => onToggleMute(e.target.checked)} />
          Don&apos;t show this message again
        </label>
      </div>
    </div>
  )
}
