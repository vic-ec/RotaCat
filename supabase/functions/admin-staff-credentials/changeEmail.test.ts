import { describe, it, expect } from 'vitest'
import {
  checkChangeEmailRequest, isSameEmail, isDuplicateEmailError, isResetFor,
  SUPER_ADMIN_ONLY_MESSAGE, OWN_EMAIL_MESSAGE,
} from './changeEmail'

const SUPER = { id: 'super-1', isSuperAdmin: true }
const ADMIN = { id: 'admin-1', isSuperAdmin: false }

describe('checkChangeEmailRequest', () => {
  // The UI hides the control from ordinary admins, but this check is the
  // real gate: a direct call to the function must be refused.
  it('refuses an admin who is not the super-admin with a 403', () => {
    const result = checkChangeEmailRequest(ADMIN, { profileId: 'p2', email: 'new@example.com' })
    expect(result).toEqual({ ok: false, status: 403, error: SUPER_ADMIN_ONLY_MESSAGE })
  })

  it('checks permission before anything else', () => {
    expect(checkChangeEmailRequest(ADMIN, {})).toMatchObject({ status: 403 })
  })

  it('refuses the caller’s own account', () => {
    const result = checkChangeEmailRequest(SUPER, { profileId: 'super-1', email: 'new@example.com' })
    expect(result).toEqual({ ok: false, status: 400, error: OWN_EMAIL_MESSAGE })
  })

  it('requires a profileId', () => {
    expect(checkChangeEmailRequest(SUPER, { email: 'new@example.com' }))
      .toEqual({ ok: false, status: 400, error: 'profileId is required.' })
  })

  it.each(['', '   ', 'not-an-email', 'a@b', 'two words@example.com', null, 42])(
    'rejects %j as an email address', (email) => {
      expect(checkChangeEmailRequest(SUPER, { profileId: 'p2', email }))
        .toEqual({ ok: false, status: 400, error: 'Enter a valid email address.' })
    })

  it('trims and lowercases the address', () => {
    expect(checkChangeEmailRequest(SUPER, { profileId: ' p2 ', email: '  Ada.Nkosi@Example.COM ' }))
      .toEqual({ ok: true, profileId: 'p2', email: 'ada.nkosi@example.com', sendCredentials: false })
  })

  // Issuing a password invalidates the current one, so only an explicit
  // boolean true does it — never a truthy string or a missing field.
  it('only sends credentials on an explicit true', () => {
    const base = { profileId: 'p2', email: 'new@example.com' }
    expect(checkChangeEmailRequest(SUPER, { ...base, sendCredentials: true })).toMatchObject({ sendCredentials: true })
    expect(checkChangeEmailRequest(SUPER, { ...base, sendCredentials: 'true' })).toMatchObject({ sendCredentials: false })
    expect(checkChangeEmailRequest(SUPER, base)).toMatchObject({ sendCredentials: false })
  })
})

describe('isSameEmail', () => {
  it('ignores case and surrounding space', () => {
    expect(isSameEmail('Ada@Example.com ', 'ada@example.com')).toBe(true)
    expect(isSameEmail('ada@example.com', 'ada@example.org')).toBe(false)
    expect(isSameEmail(null, 'ada@example.com')).toBe(false)
  })
})

describe('isDuplicateEmailError', () => {
  it('recognises Supabase Auth’s duplicate-address wording', () => {
    expect(isDuplicateEmailError('A user with this email address has already been registered')).toBe(true)
    expect(isDuplicateEmailError('Database error saving user')).toBe(false)
    expect(isDuplicateEmailError(undefined)).toBe(false)
  })
})

describe('isResetFor', () => {
  it('sends the welcome email to an account that has never signed in', () => {
    expect(isResetFor(null)).toBe(false)
    expect(isResetFor(undefined)).toBe(false)
  })
  it('sends the reset email once the account has been used', () => {
    expect(isResetFor('2026-11-01T08:00:00Z')).toBe(true)
  })
})
