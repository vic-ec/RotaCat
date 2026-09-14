import { useRef } from 'react'

// Shared date-picker trigger — a rectangle (never a pill) showing a generic
// label ("From", "To", "Saturday", …) until a date is picked, then swapping
// the label for the formatted picked value. Replaces three previously
// inconsistent treatments (Leave request form's label-above-field pair,
// Leave Audit log's inline field pair, and the roster/weekend review logs'
// icon-only CompactDateField pill) with one component everywhere a single
// date needs picking.
//
// `fullWidth` opts out of that fixed width for a field that is one item in
// a stacked form rather than one of a pair in a toolbar row — there it has
// to line up with the selects and inputs above it, which are all `w-full`.
//
// Fixed width (not content-sized) is otherwise the whole point: a "From"/"To" pair
// built from two independently content-sized triggers renders at two
// different widths until both have values (a real bug — "To" being
// narrower than "From" caused them to collide on mobile). A shared fixed
// width means a From/To pair always renders identically regardless of
// which one has a value or how long its formatted date is. It is w-40
// rather than w-36 because the clear button below takes 28px off the right:
// at the old width the longest formatted date ("13 Sept 2026") truncated to
// "13 Sept 2..." the moment it had an x to sit beside. Both fields grow,
// not just the one holding a value — the pair has to stay identical.
//
// The native <input type="date"> is stacked invisibly over the whole
// button so tapping anywhere on it opens the OS's own date picker on
// mobile, where that's the reliable behaviour.
//
// Desktop needs the explicit showPicker() call on top of that: Chrome and
// Edge only open the picker when the click lands on the input's own
// ::-webkit-calendar-picker-indicator, a ~20px target at the right edge —
// and `opacity-0` makes that target invisible, so clicking the field
// anywhere else just silently focuses a hidden segment and looks broken.
// showPicker() is guarded rather than assumed: it throws if the browser
// doesn't have it, if the picker is already showing, or if the call didn't
// come from a real user gesture, and in every one of those cases the
// stacked input's own click behaviour is still there underneath.
//
// The clear (x) is the same affordance every text field in the app carries
// (see ClearableInput) — a picked date was hard to get rid of, since the
// only route was opening the OS picker and hunting for its own clear. Two
// differences from ClearableInput, both because this is not a text field:
// it shows on value alone rather than on focus-and-value (there is no
// "while editing" here — the input is invisible and the value only exists
// because someone picked it), and it has to sit ABOVE the stacked input,
// which covers the whole box and would otherwise swallow the tap.
function CalendarIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

function ClearIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DateFieldButton({ label, value, onChange, min, max, required = false, id, fullWidth = false, className = '' }) {
  const inputRef = useRef(null)

  function openPicker() {
    try { inputRef.current?.showPicker() } catch { /* see the note above */ }
  }

  return (
    <span
      onClick={openPicker}
      className={`relative inline-flex h-[30px] items-center gap-1.5 rounded border border-slate-line bg-field pl-2 text-sm ${
        fullWidth ? 'w-full' : 'w-40 flex-shrink-0'
      } ${value ? 'pr-7' : 'pr-2'} ${className}`}
    >
      <CalendarIcon className="h-4 w-4 flex-shrink-0 text-ink-muted" />
      <span className={`truncate ${value ? 'text-ink' : 'text-ink-light'}`}>{value ? formatDate(value) : label}</span>
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {value && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onChange('') }}
          aria-label={`Clear ${label}`}
          tabIndex={-1}
          className="absolute right-2 top-1/2 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-ink-muted/50 text-canvas hover:bg-ink-muted/70"
        >
          <ClearIcon className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}
