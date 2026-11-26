import { CircleCheck } from 'lucide-react'

// A roster's status as one icon, where there's no room for the pill: a
// dashed amber circle with a tick for a draft (not yet final), a solid
// green one for published (the pill's colours; roster-state tokens). Its
// name is its title, shown on hover or a tap (HintLayer). Used by the
// roster's header bar and the Rosters list's phone rows.
export default function RosterStatusIcon({ status, className = '' }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="roster-status-icon"
      className={`inline-flex flex-shrink-0 cursor-help items-center justify-center ${
        status === 'published' ? 'text-success' : status === 'draft' ? 'text-flagAmber' : 'text-ink-muted'
      } ${className}`}
    >
      {status === 'draft' ? <CircleDashedCheck className="h-full w-full" /> : <CircleCheck className="h-full w-full" />}
    </span>
  )
}

// Lucide's circle-dashed with circle-check's tick inside. Drawn here: the
// installed lucide has no CircleDashedCheck.
function CircleDashedCheck(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.1 2.182a10 10 0 0 1 3.8 0" />
      <path d="M13.9 21.818a10 10 0 0 1-3.8 0" />
      <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" />
      <path d="M2.182 13.9a10 10 0 0 1 0-3.8" />
      <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" />
      <path d="M21.818 10.1a10 10 0 0 1 0 3.8" />
      <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" />
      <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
