// Single source of truth for the "RotaCat" wordmark's two-tone styling.
// Anywhere the app name is displayed, import this instead of typing
// "RotaCat" as plain text, so the teal "Cat" can't drift out of sync.

// `onSheen`: the wordmark on a sheen surface (the Dashboard header) — near-
// white "Rota", mint "Cat" — per docs/app-theme/SPEC.md.
export default function RotaCat({ className, onSheen = false }) {
  return (
    <span className={className}>
      Rota<span className={onSheen ? 'text-on-sheen-accent' : 'text-accent'}>Cat</span>
    </span>
  )
}
