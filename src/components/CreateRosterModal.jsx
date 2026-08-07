// "Create roster" popup (§1.7-1.8): asks which of the two roster-creation
// flows the admin wants. Matches the app's standard modal convention (full-
// screen bg-ink/20 backdrop, card stops propagation) — clicking the
// backdrop closes the popup and, since the backdrop intercepts the click,
// nothing underneath it fires ("mute background actions until closed").
// Options sit side by side on desktop, stacked on mobile; each shows its
// blurb as a hover tooltip rather than static copy, per the spec.
export default function CreateRosterModal({ onClose, onGenerate, onBuild }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">Which roster do you want to create?</h2>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <RosterOptionButton
            label="Generate one for me"
            tooltip="A complete roster will be created"
            onClick={onGenerate}
          />
          <RosterOptionButton
            label="Build my own"
            tooltip="A blank roster will be created"
            onClick={onBuild}
          />
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function RosterOptionButton({ label, tooltip, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex-1 rounded-lg border border-slate-line bg-canvas-raised p-5 text-center transition-colors hover:border-accent hover:bg-accent-tint active:border-accent active:bg-accent-tint"
    >
      <p className="text-sm font-semibold text-ink">{label}</p>
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded bg-ink px-2.5 py-1.5 text-xs text-white opacity-0 shadow-raised transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {tooltip}
      </span>
    </button>
  )
}
