// Copyright line shown at the bottom of every unauthenticated auth screen.
// `onLight` switches to dark muted text for use on the mobile bottom
// sheet (bg-accent-light); the default (white/70) is for the desktop
// teal background. `topGap` lets a caller match this line's margin-top
// to its own bottom padding, so the space above and below the footer
// line reads as equal instead of defaulting to a small fixed gap.
export default function AuthFooter({ onLight = false, topGap = 'mt-3' }) {
  return (
    <p className={`${topGap} text-center text-xs ${onLight ? 'text-ink-muted' : 'text-white/70'}`}>
      © {new Date().getFullYear()} vic-ec. All rights reserved.
    </p>
  )
}
