// One of the mobile detail sheet's four icon-only actions (Message/Call/
// Email/View Account) — a generously-sized touch target (48px tall) with
// visible pressed feedback, since three of these hand off to another app
// entirely and a user should feel their tap land before that happens.
export default function SheetActionButton({ icon, label, href, onClick, onMissing, expanded }) {
  // A filled tray rather than four empty outlines: on the sheet's own
  // `canvas-raised` an outline-only button is a rectangle of nothing, and
  // these four are the only thing on the sheet you can actually do.
  const className = 'flex h-12 flex-1 items-center justify-center rounded-lg border border-slate-line bg-canvas-sunken text-ink-light transition-all hover:border-accent/40 hover:bg-accent-tint hover:text-accent active:scale-95 active:border-accent/40 active:bg-accent-tint active:text-accent'
  if (href) {
    return (
      <a href={href} title={label} aria-label={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={className}>
        {icon}
      </a>
    )
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-haspopup={expanded !== undefined ? 'menu' : undefined}
      aria-expanded={expanded}
      onClick={e => { e.stopPropagation(); onClick ? onClick(e) : onMissing() }}
      className={`${className} ${expanded ? 'border-accent/40 bg-accent-tint text-accent' : ''}`}
    >
      {icon}
    </button>
  )
}
