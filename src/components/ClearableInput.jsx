// Text input with a small grey (x) button that appears once there's a
// value, to clear it in one tap — the iOS Contacts-style clear-field
// affordance used throughout the app's free-text fields (search boxes,
// name/password fields, phone/email edit, etc). Drop-in replacement for a
// plain <input>: takes the same props, just renders the button alongside it.
export default function ClearableInput({ value, onChange, onClear, className = '', clearLabel = 'Clear field', ...props }) {
  const handleClear = onClear || (() => onChange({ target: { value: '' } }))
  return (
    <div className="relative">
      <input
        value={value}
        onChange={onChange}
        className={`${className} pr-8`}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={clearLabel}
          tabIndex={-1}
          className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-ink-muted/50 text-white hover:bg-ink-muted/70"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-2.5 w-2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
