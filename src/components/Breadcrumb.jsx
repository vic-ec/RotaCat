import { useNavigate } from 'react-router-dom'

function ArrowLeftIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

// Shared "← Label" back-navigation link — extracted from the near-identical
// buttons Account and Staff had each independently built. Use only when it
// adds navigation info not already available from tabs or the sidebar; never
// show one that duplicates an already-active tab. See
// docs/design/layout-spec.md §4.
//
// `to`: navigate to a fixed path (e.g. a tab switch or a known parent
// route). Omit both `to` and `onClick` to fall back to browser-style "go
// back one step" (`navigate(-1)`) — this is what powers Account's
// "back to wherever you came from" link, which stays dynamic rather than a
// hardcoded destination.
//
// Truncates long labels with an ellipsis rather than wrapping (§15) —
// `min-w-0` lets the flex child actually shrink below its content width so
// `truncate` has room to take effect.
export default function Breadcrumb({ label, to, onClick, className = '' }) {
  const navigate = useNavigate()
  function handleClick() {
    if (onClick) { onClick(); return }
    if (to) { navigate(to); return }
    navigate(-1)
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`mb-4 inline-flex min-w-0 max-w-full items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink ${className}`}
    >
      <ArrowLeftIcon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
