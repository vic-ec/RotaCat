import { describe, it, expect } from 'vitest'
import { generatePassword, meetsPasswordPolicy, MIN_LENGTH, GENERATED_LENGTH } from './password'

describe('generatePassword', () => {
  // The policy is enforced by Supabase Auth on every createUser call, so a
  // generator that only *usually* satisfies it would fail in production at
  // random. Run it enough times that a missing character class would show.
  it('satisfies the Supabase Auth password policy on every generation', () => {
    for (let i = 0; i < 500; i++) {
      const password = generatePassword()
      expect(meetsPasswordPolicy(password), `failed policy: ${password}`).toBe(true)
    }
  })

  it('generates longer than the policy minimum by default', () => {
    expect(GENERATED_LENGTH).toBeGreaterThan(MIN_LENGTH)
    expect(generatePassword()).toHaveLength(GENERATED_LENGTH)
  })

  it('honours a requested length but never drops below the policy minimum', () => {
    expect(generatePassword(20)).toHaveLength(20)
    expect(generatePassword(4)).toHaveLength(MIN_LENGTH)
  })

  // These get read off an email and typed by hand on a phone — 0/O and
  // 1/l/I are left out of the alphabets on purpose.
  it('never emits lookalike characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).not.toMatch(/[0O1lI]/)
    }
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()))
    expect(seen.size).toBe(200)
  })

  // The four guaranteed characters are shuffled, so no position should be
  // locked to one class across many generations.
  it('does not put the guaranteed character classes in fixed positions', () => {
    const firstChars = new Set(Array.from({ length: 200 }, () => generatePassword()[0]))
    expect(firstChars.size).toBeGreaterThan(4)
  })
})

describe('meetsPasswordPolicy', () => {
  it('rejects passwords missing a required class or too short', () => {
    expect(meetsPasswordPolicy('Abcdefgh9!')).toBe(true)
    expect(meetsPasswordPolicy('Abcdefg9!')).toBe(false)   // 9 chars
    expect(meetsPasswordPolicy('abcdefgh9!')).toBe(false)  // no uppercase
    expect(meetsPasswordPolicy('ABCDEFGH9!')).toBe(false)  // no lowercase
    expect(meetsPasswordPolicy('Abcdefghi!')).toBe(false)  // no digit
    expect(meetsPasswordPolicy('Abcdefghi9')).toBe(false)  // no symbol
    expect(meetsPasswordPolicy('')).toBe(false)
  })
})
