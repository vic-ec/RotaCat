// The eye / eye-with-a-slash button that reveals a password field's
// contents, and the two icons behind it.
//
// Previously declared three separate times — inline in LoginPage and
// SignupPage, and again inside ClearableInput — with the same path data
// copied each time, while ResetPasswordPage and SetPasswordPage had no
// toggle at all. One copy now, so every password field in the app reveals
// the same way and the icon can't drift between screens.
//
// `variant` covers the two real sizes rather than a pile of class props:
//   - 'auth'  — the large onboarding fields (Login, Sign-up, Reset, Set
//     password): a 20px icon inset 16px from the right, inside a field
//     with `pr-12`.
//   - 'field' — the compact `.input-field` used in the authenticated app
//     (via ClearableInput): a 16px icon inset 8px, sharing `pr-14` with
//     the clear button that sits to its left.
//
// The 'field' variant keeps itself out of the tab order and swallows
// mousedown: it sits inside a form where tabbing should move between
// actual fields, and taking focus on click would dismiss the clear button
// next to it mid-tap. The 'auth' variant stays tabbable — on those screens
// it's one of only a handful of controls, and reaching it by keyboard is
// genuinely useful when a typo is suspected.
const VARIANTS = {
  auth: {
    button: 'absolute inset-y-0 right-4 flex items-center text-ink-muted transition-colors hover:text-ink',
    icon: 'h-5 w-5',
    unfocusable: false,
  },
  field: {
    button: 'absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-ink-muted hover:text-ink',
    icon: 'h-4 w-4',
    unfocusable: true,
  },
}

export default function PasswordRevealToggle({ revealed, onToggle, variant = 'auth', className = '' }) {
  const style = VARIANTS[variant] || VARIANTS.auth
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseDown={style.unfocusable ? (e => e.preventDefault()) : undefined}
      tabIndex={style.unfocusable ? -1 : undefined}
      aria-label={revealed ? 'Hide password' : 'Show password'}
      className={`${style.button} ${className}`}
    >
      {revealed ? <EyeOffIcon className={style.icon} /> : <EyeIcon className={style.icon} />}
    </button>
  )
}

export function EyeIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0112 20C7 20 2.73 16.89 1 12c.73-2.06 2-3.85 3.6-5.22" />
      <path d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
      <path d="M1 1l22 22" />
      <path d="M9.88 4.24A10.94 10.94 0 0112 4c5 0 9.27 3.11 11 8a11.83 11.83 0 01-4.24 5.18" />
    </svg>
  )
}
