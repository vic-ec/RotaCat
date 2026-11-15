// A password an admin issues (Add staff, Regenerate password) is good for
// a fixed window. After that the account is still there, but the password
// no longer gets anyone in: sign-in refuses it and the set-password screen
// will not accept it, so a welcome email that sat unread for a month
// cannot be used later by whoever finds it. An admin regenerates to issue
// a fresh one, which restarts the window.
//
// `temp_password_issued_at` is stamped by the admin-staff-credentials
// function whenever it sets a password, and cleared with
// must_change_password once the person chooses their own.

export const TEMP_PASSWORD_VALIDITY_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export function tempPasswordExpiresAt(issuedAt) {
  if (!issuedAt) return null
  const issued = new Date(issuedAt)
  if (Number.isNaN(issued.getTime())) return null
  return new Date(issued.getTime() + TEMP_PASSWORD_VALIDITY_DAYS * DAY_MS)
}

// True only for an account still on an admin-issued password whose window
// has closed. An account with the flag but no issue date (one from before
// the window existed) is treated as unexpired.
export function isTempPasswordExpired(profile, now = new Date()) {
  if (!profile || profile.must_change_password !== true) return false
  const expiresAt = tempPasswordExpiresAt(profile.temp_password_issued_at)
  return expiresAt ? expiresAt.getTime() <= now.getTime() : false
}

export const TEMP_PASSWORD_EXPIRED_CODE = 'temp_password_expired'
export const TEMP_PASSWORD_EXPIRED_MESSAGE =
  'Your temporary password has expired. Ask an admin to issue a new one.'

export function formatExpiryDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
