// Copyright line shown at the bottom of every unauthenticated auth screen.
// `onLight` switches to dark muted text for use on the mobile bottom
// sheet (bg-accent-light); the default (white/70) is for the desktop
// teal background.
export default function AuthFooter({ onLight = false }) {
  return (
    <p className={`mt-3 text-center text-xs ${onLight ? 'text-ink-muted' : 'text-white/70'}`}>
      © {new Date().getFullYear()} vic-ec. All rights reserved.
    </p>
  )
}
