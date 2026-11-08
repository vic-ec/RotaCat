// One set of classes for every unauthenticated screen — the sign-in form,
// the three registration forms, the forgot-password and sign-in modals,
// the reset-password and set-password pages and the pending-approval
// card — so they all share the login redesign's field, button, link and
// panel treatment (docs/design/login-redesign/SPEC.md) rather than each
// carrying its own copy that drifts. Tokens only; no hex here.

// A text field: 2px accent/70 border, 14px radius, solid focus outline.
// `icon` reserves room for a leading icon, `trailing` for the password
// eye; `invalid` turns the border solid red. `large` is the full-page
// size (the inline login form's), which steps up from `md`; modals keep
// the base size since they are narrow at every width.
export function authFieldClass({ icon = false, trailing = false, invalid = false, large = false, modal = false, extra = '' } = {}) {
  return [
    'w-full rounded-[14px] border-2 bg-field text-base text-ink placeholder:text-ink-muted',
    'transition-colors focus:bg-field focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent',
    icon ? 'pl-12' : 'pl-4',
    trailing ? 'pr-12' : 'pr-4',
    // `modal` is the auth modals' fixed 44px control (AUTH_MODAL.field) —
    // one height for text inputs, selects and the date picker alike.
    modal ? AUTH_MODAL.field : large ? 'py-2 md:py-3 md:text-lg' : 'py-2.5',
    invalid ? 'border-flagRed' : 'border-accent/70 focus:border-accent',
    extra,
  ].join(' ')
}

// The auth modals' shared scale (AuthModal + AuthField): the four dialogs —
// the three registration forms and Reset your password — are built from
// these and nothing else, so a change here moves all four together.
//   field 44px · button 48px · radius 14px · label→field 6px ·
//   group→group 16px · field→helper 4px · panel padding 24px (16px <640px)
export const AUTH_MODAL = {
  field: 'h-11 py-0',
  label: 'mb-1.5 block text-sm font-semibold text-ink',
  hint: 'mt-1 text-xs text-ink-light',
  fieldError: 'mt-1 text-sm text-flagRed',
  groupGap: 'gap-4',
  padX: 'px-4 sm:px-6',
  padY: 'py-4',
  // Two widths: `small` for a single-purpose dialog (Reset your password),
  // `medium` for the registration forms, which lay their fields out in two
  // columns from 640px.
  sizes: { small: 'max-w-[420px]', medium: 'max-w-[560px]' },
}

export const AUTH_LABEL = 'mb-1.5 block text-sm font-semibold text-ink'
export const AUTH_LABEL_LG = 'mb-1.5 block text-sm font-semibold text-ink md:text-base'
export const AUTH_SUBLABEL = 'mb-1 block text-xs font-medium text-ink-light'

// Teal, underlined — rose is a brand accent, not a UI colour.
export const AUTH_LINK = 'font-medium text-accent underline decoration-accent/45 underline-offset-4 transition-colors hover:text-accent-dark hover:decoration-accent-dark'
// A link that must stay quiet (e.g. "Back to sign in" under a form).
export const AUTH_LINK_MUTED = 'font-medium text-ink-light underline decoration-ink-light/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink'

// The filled primary action, bevelled, at the login form's 66px (the one
// height every auth form shares); `large: false` is the compact size.
export function authButtonClass({ large = true, extra = '' } = {}) {
  return [
    'btn-bevel w-full rounded-[14px] bg-accent font-semibold text-on-fill transition-colors',
    'hover:bg-accent-dark active:bg-accent-dark',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    'disabled:opacity-60 aria-disabled:opacity-60',
    large ? 'py-[19px] text-lg' : 'py-3 text-base',
    extra,
  ].join(' ')
}

// The outlined secondary action (Continue, Back to sign in, Request a new
// link): white face, accent/70 border, outlined bevel.
export const AUTH_BUTTON_OUTLINE = 'btn-bevel-outline inline-flex items-center justify-center rounded-[14px] border-2 border-accent/70 bg-auth-modal px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:border-accent hover:bg-auth-choice-hover active:border-accent active:bg-auth-choice-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// A floating panel (modal, standalone card): the login card's own corners,
// hairline and shadow. The header strip sits on white with the seam line
// under it, matching the card's divider.
export const AUTH_PANEL = 'rounded-[24px] border border-auth-shell-border bg-auth-modal shadow-auth-shell'
export const AUTH_PANEL_HEADER = 'flex shrink-0 items-center justify-between border-b border-auth-seam px-5 py-4'
export const AUTH_PANEL_TITLE = 'text-lg font-semibold text-ink'
export const AUTH_CLOSE_BUTTON = '-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink'

// Messages.
export const AUTH_ERROR = 'flex items-center gap-2 rounded-lg border border-flagRed/30 bg-flagRed-bg px-4 py-3 text-sm text-flagRed'
export const AUTH_FIELD_ERROR = 'mt-1.5 text-sm text-flagRed'
export const AUTH_HINT = 'mt-1.5 text-xs text-ink-light'
