import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SetPasswordPage from './SetPasswordPage'

const { authState, updateUser, profileUpdates, updateResult } = vi.hoisted(() => ({
  authState: { current: {} },
  updateUser: vi.fn(),
  profileUpdates: [],
  updateResult: { current: { error: null } },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState.current }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { updateUser },
    from(table) {
      const builder = {
        update(payload) { profileUpdates.push({ table, payload }); return builder },
        eq(col, val) {
          profileUpdates[profileUpdates.length - 1].eq = [col, val]
          return Promise.resolve(updateResult.current)
        },
      }
      return builder
    },
  },
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/set-password']}>
      <Routes>
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('SetPasswordPage', () => {
  beforeEach(() => {
    profileUpdates.length = 0
    updateUser.mockReset()
    updateUser.mockResolvedValue({ error: null })
    updateResult.current = { error: null }
    authState.current = {
      profile: { id: 'u1', name: 'Ada' },
      mustChangePassword: true,
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn(),
    }
  })

  // Clearing must_change_password is the whole point; touching is_approved
  // would re-open an identity question that was settled when the admin
  // created the account.
  it('sets the password, then clears only the password flag', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('New password'), 'Str0ng!Passw0rd')
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd')
    await user.click(screen.getByRole('button', { name: /Save password and continue/ }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'Str0ng!Passw0rd' }))
    expect(profileUpdates).toEqual([
      { table: 'profiles', payload: { must_change_password: false }, eq: ['id', 'u1'] },
    ])
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('enforces the same password rule the rest of the app uses', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('New password'), 'short1!')
    await user.type(screen.getByLabelText('Confirm password'), 'short1!')
    await user.click(screen.getByRole('button', { name: /Save password and continue/ }))

    expect(await screen.findByText('Password must be at least 10 characters.')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects a mismatched confirmation', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('New password'), 'Str0ng!Passw0rd')
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rdd')
    await user.click(screen.getByRole('button', { name: /Save password and continue/ }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  // Order matters: clearing the flag first would lift the gate for someone
  // still using the password an admin issued.
  it('leaves the flag set when the password change itself fails', async () => {
    updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('New password'), 'Str0ng!Passw0rd')
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd')
    await user.click(screen.getByRole('button', { name: /Save password and continue/ }))

    expect(await screen.findByText('New password should be different from the old password.')).toBeInTheDocument()
    expect(profileUpdates).toEqual([])
  })

  it('tells the user what to do if the flag write fails after the password changed', async () => {
    updateResult.current = { error: { message: 'permission denied' } }
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('New password'), 'Str0ng!Passw0rd')
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd')
    await user.click(screen.getByRole('button', { name: /Save password and continue/ }))

    expect(await screen.findByText(/Sign out and back in with your new password/)).toBeInTheDocument()
  })

  it('sends anyone whose flag is already clear back to the app', () => {
    authState.current = { ...authState.current, mustChangePassword: false }
    renderPage()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  // Signing out ends the session rather than getting past the requirement
  // — it is not a "later" button.
  it('offers sign-out as the only way off the screen', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Sign out instead' }))
    expect(authState.current.signOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /skip|later|not now/i })).not.toBeInTheDocument()
  })
})
