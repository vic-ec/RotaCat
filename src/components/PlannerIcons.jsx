// Shared icon-only glyphs for two controls repeated across every leave/
// rotation planner: "jump back to today" and "open the colour-key sheet".
// Both used to be plain text buttons ("Today"/"Legend") — deliberately
// literal, on-brand shapes rather than a generic bullseye/info glyph: a
// calendar with one cell picked out for Today (that's what the button
// actually does to the grid it sits above), a stack of the app's own
// capacity colours for Legend (that's literally the sheet it opens).
// `aria-hidden` on both — every caller supplies its own `aria-label` on
// the surrounding button, matching how every other icon-only trigger in
// the app (DateStepper's own ←/→) already works.
export function TodayIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4M8 2v4M3 9h18" />
      <rect x="9.4" y="13" width="5.2" height="4.2" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function LegendIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4.5" width="4.2" height="4.2" rx="1" fill="#16A34A" stroke="none" />
      <rect x="4" y="9.9" width="4.2" height="4.2" rx="1" fill="#F97316" stroke="none" />
      <rect x="4" y="15.3" width="4.2" height="4.2" rx="1" fill="#DC2626" stroke="none" />
      <line x1="11.4" y1="6.6" x2="20" y2="6.6" />
      <line x1="11.4" y1="12" x2="20" y2="12" />
      <line x1="11.4" y1="17.4" x2="20" y2="17.4" />
    </svg>
  )
}
