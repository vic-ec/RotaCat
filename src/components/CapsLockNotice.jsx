// Shared warning shown under a password field while Caps Lock is on — same
// text/style everywhere so the message doesn't drift between forms. Pair
// with the `useCapsLockWarning` hook (src/lib/useCapsLockWarning.js).
export default function CapsLockNotice({ show }) {
  if (!show) return null
  return (
    <p className="mt-1 text-xs font-medium text-flagAmber">Caps Lock is on</p>
  )
}
