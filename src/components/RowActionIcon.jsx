// The one format for an action on a table or list row: a small icon-only
// button, the same on a desktop and a phone, whose `title` is its label —
// the app's HintLayer shows that on hover or tap, so no row spends width on
// button text. Used by the Staff list (message / call / mail), the Rosters
// list (view / edit / publish) and Team Leave (cancel).
//
// `title` is the short label shown ("Edit"); `label` is the fuller name a
// screen reader gets when a row has several of these ("Edit October 2026").
//
// `tone`:
//   default  quiet grey, for the ordinary actions
//   primary  filled accent, for the row's one forward action (Publish)
//   danger   red, for one that removes or cancels something
//   success  green, for an approve
//
// Renders a real `<a>` when given an `href` (so middle-click and "open in
// new tab" work), a button otherwise. With neither an href nor an onClick,
// the button calls `onMissing` — the Staff list's "no contact detail on
// record" case. Clicks never reach the row behind it.
const TONE_CLASS = {
  default: 'text-ink-muted hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink',
  // The fill is on an inner 28px square (see below), so a phone's 36px
  // tap target doesn't paint a 36px teal block.
  primary: 'group text-white',
  danger: 'text-danger hover:bg-flagRed-bg active:bg-flagRed-bg',
  success: 'text-success hover:bg-success-bg active:bg-success-bg',
  'primary-text': 'text-accent hover:bg-accent-light active:bg-accent-light',
}

export default function RowActionIcon({ icon, href, title, label, onClick, onMissing, tone = 'default' }) {
  // 28px on a desktop, where a pointer is precise; 36px on a phone, where
  // two of these sit side by side under a thumb.
  const className = `flex h-9 w-9 flex-shrink-0 items-center justify-center rounded transition-colors md:h-7 md:w-7 ${TONE_CLASS[tone] || TONE_CLASS.default}`
  const content = tone === 'primary'
    ? <span className="flex h-7 w-7 items-center justify-center rounded bg-accent transition-colors group-hover:bg-accent-dark group-active:bg-accent-dark">{icon}</span>
    : icon
  if (href) {
    return (
      <a href={href} title={title} aria-label={label || title} onClick={e => e.stopPropagation()} className={className}>
        {content}
      </a>
    )
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={label || title}
      onClick={e => { e.stopPropagation(); (onClick || onMissing)?.() }}
      className={className}
    >
      {content}
    </button>
  )
}
