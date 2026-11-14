import { describe, it, expect } from 'vitest'
import { isTempPasswordExpired, tempPasswordExpiresAt, TEMP_PASSWORD_VALIDITY_DAYS } from './tempPassword'

describe('temporary password validity', () => {
  const issued = '2026-11-01T09:00:00.000Z'

  it('expires exactly 14 days after it was issued', () => {
    expect(TEMP_PASSWORD_VALIDITY_DAYS).toBe(14)
    expect(tempPasswordExpiresAt(issued).toISOString()).toBe('2026-11-15T09:00:00.000Z')
  })

  it('is live inside the window and expired once it closes', () => {
    const profile = { must_change_password: true, temp_password_issued_at: issued }
    expect(isTempPasswordExpired(profile, new Date('2026-11-14T23:59:00Z'))).toBe(false)
    expect(isTempPasswordExpired(profile, new Date('2026-11-15T09:00:00Z'))).toBe(true)
    expect(isTempPasswordExpired(profile, new Date('2026-12-01T00:00:00Z'))).toBe(true)
  })

  it('never expires an account that has set its own password, or one with no issue date', () => {
    expect(isTempPasswordExpired({ must_change_password: false, temp_password_issued_at: issued }, new Date('2027-01-01'))).toBe(false)
    expect(isTempPasswordExpired({ must_change_password: true, temp_password_issued_at: null }, new Date('2027-01-01'))).toBe(false)
    expect(isTempPasswordExpired(null)).toBe(false)
  })
})
