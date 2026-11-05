// Shared warning shown under a password field while Caps Lock is on — same
// text/style everywhere so the message doesn't drift between forms. Pair
// with the `useCapsLockWarning` hook (src/lib/useCapsLockWarning.js).
//
// Set in `flagAmber-text`, not `flagAmber`: the badge amber is 3.4:1 on
// white, below AA for a sentence. `className` replaces the default spacing
// and size when a caller lays the notice out itself (the login form draws
// it inside a fixed gap so the fields never move).
export default function CapsLockNotice({ show, className = 'mt-1 text-xs' }) {
  if (!show) return null
  return (
    <p className={`flex items-center gap-1.5 font-medium text-flagAmber-text ${className}`}>
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-12a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 8.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z"
          clipRule="evenodd"
        />
      </svg>
      Caps Lock is on
    </p>
  )
}
