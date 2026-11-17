import { describe, it, expect, vi, beforeEach } from 'vitest'
import { changeStaffEmail, regenerateStaffPassword } from './staffCredentials'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

describe('changeStaffEmail', () => {
  beforeEach(() => { invoke.mockReset() })

  it('calls the change_email action with the profile, address and choice', async () => {
    invoke.mockResolvedValue({ data: { ok: true, profileId: 'p2', email: 'new@example.com', credentialsIssued: true, emailSent: true }, error: null })

    const result = await changeStaffEmail('p2', 'new@example.com', true)

    expect(invoke).toHaveBeenCalledWith('admin-staff-credentials', {
      body: { action: 'change_email', profileId: 'p2', email: 'new@example.com', sendCredentials: true },
    })
    expect(result).toEqual({ ok: true, profileId: 'p2', email: 'new@example.com', credentialsIssued: true, emailSent: true })
  })

  // Issuing credentials invalidates the current password, so anything
  // short of an explicit true is sent as false.
  it('sends sendCredentials as a strict boolean', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await changeStaffEmail('p2', 'new@example.com', undefined)
    expect(invoke.mock.calls[0][1].body.sendCredentials).toBe(false)
  })

  // supabase-js reports a non-2xx as a generic error with the real body on
  // error.context — the function's own message is what the admin must see.
  it('passes the function’s refusal message through', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: () => Promise.resolve({ error: 'Only the super-admin can change a staff email address.' }) },
      },
    })

    expect(await changeStaffEmail('p2', 'new@example.com', false))
      .toEqual({ ok: false, error: 'Only the super-admin can change a staff email address.' })
  })

  it('falls back to the transport error when the body is not JSON', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch', context: { json: () => Promise.reject(new Error('not json')) } },
    })
    expect(await changeStaffEmail('p2', 'new@example.com', false)).toEqual({ ok: false, error: 'Failed to fetch' })
  })
})

describe('regenerateStaffPassword', () => {
  it('still calls the regenerate action unchanged', async () => {
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { ok: true, emailSent: true }, error: null })
    await regenerateStaffPassword('p2')
    expect(invoke).toHaveBeenCalledWith('admin-staff-credentials', { body: { action: 'regenerate', profileId: 'p2' } })
  })
})
