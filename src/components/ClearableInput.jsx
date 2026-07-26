import { useState } from 'react'

// Text input with a small grey (x) button that clears it in one tap — the
// iOS Contacts-style clear-field affordance used throughout the app's
// free-text fields (search boxes, name/password fields, phone/email edit,
// etc). Drop-in replacement for a plain <input>: takes the same props,
// just renders the button alongside it.
//
// The button only shows while the field is BOTH focused and non-empty —
// matching iOS's own `clearButtonMode: whileEditing` behaviour. Fields that
// open pre-filled (an existing phone number, a saved name) already have a
// value the moment they're expanded, so gating on value alone showed the
// button immediately, before the user had even tapped in — gating on focus
// too means it only appears once the user is actually editing.
//
// ── The app's standard text-input template ──────────────────────────────
// Any new free-text field in the authenticated app (not the Signup/Login/
// Forgot/Reset-password pages, which intentionally use their own larger
// onboarding style) should be built from this pair, not styled ad hoc:
//   - Wrap it in <ClearableInput>, not a bare <input>, whenever the field is
//     ever likely to hold a value the user would want to one-tap clear
//     (basically everything except tiny inline spreadsheet-style cell
//     editors, where there's no room for the button).
//   - className="input-field" (defined in src/styles/index.css) — 1px
//     slate-line border, canvas-raised background, rounded, px-3 py-1,
//     text-sm (14px) with placeholder:text-ink-muted. `.input-field`
//     itself carries the mobile font-size override (see index.css) that
//     keeps it at 14px instead of the 16px default, so it visually matches
//     the surrounding text-sm UI everywhere it's used.
//   - Total height is 30px (2×4px padding + 20px line-height + 2×1px
//     border) unless a specific layout needs to override it (e.g. the
//     Staff search box's h-[42px] to match adjacent 42px filter controls).
//   - The clear button is a fixed 16px grey circle (bg-ink-muted/50, white
//     X), inset 8px from the right edge, vertically centered — always add
//     `pr-8` (ClearableInput does this for you) so typed text never runs
//     under it.
//   - Never show the clear button on value alone — always gate on focus
//     too (built into this component), so pre-filled fields don't show a
//     clear button before the user has actually tapped in.
export default function ClearableInput({ value, onChange, onClear, onFocus, onBlur, className = '', clearLabel = 'Clear field', ...props }) {
  const [focused, setFocused] = useState(false)
  const handleClear = onClear || (() => onChange({ target: { value: '' } }))
  const showClear = focused && value

  return (
    <div className="relative">
      <input
        value={value}
        onChange={onChange}
        onFocus={e => { setFocused(true); onFocus?.(e) }}
        onBlur={e => { setFocused(false); onBlur?.(e) }}
        className={`${className} pr-8`}
        {...props}
      />
      {showClear && (
        <button
          type="button"
          onClick={handleClear}
          onMouseDown={e => e.preventDefault()}
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
