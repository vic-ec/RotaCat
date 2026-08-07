import { CalendarArrowUp, CalendarArrowDown } from 'lucide-react'

// Single-button flip for a genuine two-way sort choice (Newest first /
// Oldest first) — one tap directly flips direction, no popover, since a
// popover only earns its keep once there are 3+ options to choose between.
// `value`/`onChange` use 'asc'/'desc' like every other sort-direction state
// in the app; the icon and label always describe the CURRENT direction, and
// a tap flips straight to the other one.
const DIRECTION = {
  desc: { icon: CalendarArrowUp, label: 'Newest first', flipTo: 'asc' },
  asc: { icon: CalendarArrowDown, label: 'Oldest first', flipTo: 'desc' },
}

export default function SortDirectionToggle({ value, onChange, className = '' }) {
  const { icon: Icon, label, flipTo } = DIRECTION[value]
  return (
    <button
      type="button"
      onClick={() => onChange(flipTo)}
      title={label}
      aria-label={`Sort order: ${label}. Tap to switch to ${DIRECTION[flipTo].label.toLowerCase()}.`}
      className={`flex h-[30px] flex-shrink-0 items-center justify-center gap-1.5 rounded border border-accent/25 bg-canvas px-3 text-sm font-medium text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken ${className}`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </button>
  )
}
