import { forwardRef } from 'react'
import { authFieldClass, AUTH_MODAL } from '../lib/authStyles'

// The one field used by every auth-flow dialog (see AuthModal): a label,
// the 44px control, an optional helper line and an optional inline error,
// with the helper and error wired to the control through aria-describedby
// so a screen reader hears them with the field. The three registration
// forms and Reset your password are built from this and nothing else, so
// the label weight, gaps and error treatment cannot drift between them.
//
// `as`: 'input' (default) or 'select' (pass <option>s as children).
// `icon`: 'mail' | 'lock' | 'phone' — a leading glyph inside the control.
// `trailing`: a node overlaid at the control's right edge (the password
// reveal toggle); the control pads for it.
// `labelExtra`: a node set beside the label text (the password info icon).
// `optional`: appends a quiet "(optional)" to the label.
// `span`: 'full' spans both columns of a two-column form grid.
// `control`: for a field whose control is not a plain input/select (the
// date pair) — a render function given { id, describedBy, invalid };
// AuthField then supplies only the label, helper and error around it.
// `controlClassName`: extra classes on the control (the OTP field's
// centred, spaced digits). `after`: a node set under the helper and error
// (the Caps Lock notice). Everything else is passed to the control.

const ICONS = {
  mail: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  // The app's telephone handset (Staff list, Account page), not a handset-
  // shaped phone outline.
  phone: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.25 6.75c0 8.284 6.716 15 15 15h1.5a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a2.25 2.25 0 00-2.288.573l-.766.766a11.25 11.25 0 01-6.198-6.198l.766-.766a2.25 2.25 0 00.572-2.288L6.65 3.852a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 5.25v1.5z" />
    </svg>
  ),
  lock: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 118 0v3" />
    </svg>
  ),
}

// A select hides the browser's own arrow and draws this one, at the same
// 16px inset as the password field's eye, so the two line up.
function ChevronIcon() {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-ink-muted">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  )
}

const AuthField = forwardRef(function AuthField({
  id, label, labelExtra, optional = false, hint, error, icon, trailing,
  as = 'input', span, control, controlClassName = '', after, children, className = '', ...controlProps
}, ref) {
  const hintId = hint ? `${id}-hint` : null
  const errorId = error ? `${id}-error` : null
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const invalid = Boolean(error)
  const Control = as
  const isSelect = as === 'select'

  return (
    <div className={`${span === 'full' ? 'sm:col-span-2' : ''} ${className}`}>
      <label htmlFor={id} className={`${AUTH_MODAL.label} ${labelExtra ? 'flex items-center gap-1.5' : ''}`}>
        {label}
        {optional && <span className="font-normal text-ink-muted"> (optional)</span>}
        {labelExtra}
      </label>
      {control ? control({ id, describedBy, invalid }) : (
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-muted">
              {ICONS[icon]}
            </span>
          )}
          <Control
            ref={ref}
            id={id}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={authFieldClass({
              icon: Boolean(icon), trailing: Boolean(trailing) || isSelect, invalid, modal: true,
              extra: `${isSelect ? 'appearance-none' : ''} ${controlClassName}`,
            })}
            {...controlProps}
          >
            {children}
          </Control>
          {isSelect ? <ChevronIcon /> : trailing}
        </div>
      )}
      {hint && <p id={hintId} className={AUTH_MODAL.hint}>{hint}</p>}
      {error && <p id={errorId} className={AUTH_MODAL.fieldError}>{error}</p>}
      {after}
    </div>
  )
})

export default AuthField
