// Shared bulk-selection action bar — appears the moment >=1 row is
// checked, same position/styling everywhere "select all" exists. Desktop:
// sits inline, pinned above the list (in place of the section label).
// Mobile: becomes a bar fixed to the bottom of the viewport, above the
// bottom nav, so it's thumb-reachable rather than scrolling out of view
// with the list (§15). See docs/design/layout-spec.md §8.
//
// `actions`: `[{ label, onClick, tone }]` — contextual actions for this
// list (Approve/Reject, Archive/Delete, …). `tone: 'danger'` gets the
// outlined treatment, anything else gets the filled one.
export default function BulkActionBar({ count, actions, onCancel }) {
  if (!count) return null
  return (
    <div className="fixed inset-x-0 bottom-[54px] z-20 bg-ink px-4 py-3 md:static md:z-auto md:mb-3 md:rounded-lg md:px-4 md:py-2.5">
      <div className="mx-auto flex max-w-2xl items-center gap-3 text-sm font-medium text-white">
        <span className="flex-1">{count} selected</span>
        {actions.map(a => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={`rounded-md px-3 py-2 text-xs font-bold transition-opacity hover:opacity-85 active:opacity-85 ${
              a.tone === 'danger' ? 'border border-white/40 text-white/90' : 'bg-success text-white'
            }`}
          >
            {a.label}
          </button>
        ))}
        <button type="button" onClick={onCancel} className="px-2 py-2 text-xs font-medium text-white/60 hover:text-white/90">
          Cancel
        </button>
      </div>
    </div>
  )
}
