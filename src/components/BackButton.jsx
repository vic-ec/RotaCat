import { useNavigate } from 'react-router-dom'

// Shared floating back-chevron, styled after iOS Contacts' back button —
// reuse this anywhere a page needs a "return to previous screen" affordance
// instead of styling one from scratch. Spec (keep new instances consistent
// with this):
//   - `fixed`, never `sticky`/`absolute` — it must stay put on screen as the
//     page content scrolls underneath it, not travel with the page.
//   - 36x36 circle, centered chevron-left glyph (not a full arrow).
//   - Thin 0.2px white border (`border-[0.2px] border-white/80`).
//   - A genuine frosted-glass blur, not a flat tinted chip: 50% opacity fill
//     (`bg-ink/50`) over `backdrop-blur-md`, so it reads as "blurring
//     whatever's behind it" rather than sitting on top as its own solid
//     background. The fill stays dark (not fully transparent) so the white
//     chevron keeps enough contrast regardless of what's scrolling under it
//     (a photo, a light card, etc).
//   - Default position clears the mobile top bar / desktop sidebar; pass
//     `className` to override placement for a specific page if needed.
export default function BackButton({ onClick, className = '' }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={onClick || (() => navigate(-1))}
      aria-label="Back"
      className={`fixed z-20 flex h-9 w-9 items-center justify-center rounded-full border-[0.2px] border-white/80 bg-ink/50 text-white backdrop-blur-md transition-colors hover:bg-ink/65 ${
        className || 'left-4 top-[60px] md:left-64 md:top-6'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}
