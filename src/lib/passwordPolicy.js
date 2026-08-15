// Single source of truth for the new-password rule, previously redeclared
// verbatim in SignupPage.jsx, ResetPasswordPage.jsx and AccountSettingsPage.jsx.
//
// IMPORTANT: this is presentation only. Supabase Auth enforces the real
// minimum length server-side (Authentication → Providers → Email); this module
// just surfaces the requirement up front and gives a clean inline error
// instead of a raw API rejection. Both halves have to agree — bumping the
// number here alone does not enforce anything.
//
// Only applies where a NEW password is set (sign-up, reset-from-email-link,
// change-password). The login form deliberately does not use this: it checks a
// password that already exists, and legacy accounts predating this rule need
// to keep working.
export const PASSWORD_MIN_LENGTH = 10

// Built from PASSWORD_MIN_LENGTH so the regex and the hint text cannot drift.
export const PASSWORD_RULE = new RegExp(
  `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{${PASSWORD_MIN_LENGTH},}$`
)

export const PASSWORD_HINT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter, a number, and a symbol.`

// Short form for inline helper text next to the field.
export const PASSWORD_HINT_SHORT = `At least ${PASSWORD_MIN_LENGTH} characters`

// Returns a user-facing problem string, or null if the password is acceptable.
// Length is reported separately from the character-class rule so "too short"
// says so plainly rather than restating the whole requirement.
export function passwordProblem(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (!PASSWORD_RULE.test(password)) {
    return `Password doesn’t meet the requirements. ${PASSWORD_HINT}`
  }
  return null
}
