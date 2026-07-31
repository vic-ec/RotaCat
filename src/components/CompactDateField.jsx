// Icon-first date filter control: shows just "<label> [calendar icon]"
// until a date is picked, then swaps the label for the picked date —
// far narrower than a full native date input on a mobile filter bar.
// The native <input type="date"> is stacked invisibly over the whole
// pill so tapping anywhere on it opens the OS's own date picker (more
// reliable across mobile browsers than programmatic showPicker() calls).
function CalendarIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function CompactDateField({ label, value, onChange, min, max }) {
  return (
    <span className="relative inline-flex h-[30px] flex-shrink-0 items-center gap-1.5 rounded border border-slate-line bg-canvas-raised px-2 text-sm text-ink-light">
      <CalendarIcon className="h-4 w-4 flex-shrink-0 text-ink-muted" />
      <span className="whitespace-nowrap">{value ? formatShortDate(value) : label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  )
}
