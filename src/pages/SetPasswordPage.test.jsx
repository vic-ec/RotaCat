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

// Every submission needs the temporary password now — Supabase Auth's
// "Require current password when updating" setting rejects the change
// without it, which is what the first version of this screen ran into.
async function fillAndSubmit(user, { current = 'Temp0rary!Pw', password, confirm = password } = {}) {
  await user.type(screen.getByLabelText('Temporary password'), current)
  await user.type(screen.getByLabelText('New password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirm)
  await user.click(screen.getByRole('button', { name: /Save password and continue/ }))
}

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

    await fillAndSubmit(user, { password: 'Str0ng!Passw0rd' })

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({
      current_password: 'Temp0rary!Pw',
      password: 'Str0ng!Passw0rd',
    }))
    expect(profileUpdates).toEqual([
      { table: 'profiles', payload: { must_change_password: false }, eq: ['id', 'u1'] },
    ])
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('enforces the same password rule the rest of the app uses', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillAndSubmit(user, { password: 'short1!' })

    expect(await screen.findByText('Password must be at least 10 characters.')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects a mismatched confirmation', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillAndSubmit(user, { password: 'Str0ng!Passw0rd', confirm: 'Str0ng!Passw0rdd' })

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  // Order matters: clearing the flag first would lift the gate for someone
  // still using the password an admin issued.
  it('leaves the flag set when the password change itself fails', async () => {
    updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } })
    const user = userEvent.setup()
    renderPage()

    await fillAndSubmit(user, { password: 'Str0ng!Passw0rd' })

    expect(await screen.findByText('New password should be different from the old password.')).toBeInTheDocument()
    expect(profileUpdates).toEqual([])
  })

  it('tells the user what to do if the flag write fails after the password changed', async () => {
    updateResult.current = { error: { message: 'permission denied' } }
    const user = userEvent.setup()
    renderPage()

    await fillAndSubmit(user, { password: 'Str0ng!Passw0rd' })

    expect(await screen.findByText(/Sign out and back in with your new password/)).toBeInTheDocument()
  })

  // The bug this field fixes: without current_password the update came
  // back "Current password required when setting new password", with no
  // field on the form to supply it. Required, so the browser's own
  // constraint check blocks the submit before the handler runs — the
  // handler's matching guard is the backstop for anything that gets past
  // that (an autofilled-then-cleared field, a form submitted by script).
  it('will not submit without the temporary password', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByLabelText('Temporary password')).toBeRequired()

    await user.type(screen.getByLabelText('New password'), 'Str0ng!Passw0rd')
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd')
    await user.click(screen.getByRole('button', { name: /Save password and continue/ }))

    expect(updateUser).not.toHaveBeenCalled()
    expect(profileUpdates).toEqual([])
  })

  it('translates a rejected temporary password into this form’s own wording', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Current password required when setting new password.' } })
    const user = userEvent.setup()
    renderPage()

    await fillAndSubmit(user, { current: 'wrong-one', password: 'Str0ng!Passw0rd' })

    expect(await screen.findByText(/That temporary password is incorrect/)).toBeInTheDocument()
    expect(profileUpdates).toEqual([])
  })

  it('refuses a new password identical to the temporary one', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillAndSubmit(user, { current: 'Str0ng!Passw0rd', password: 'Str0ng!Passw0rd' })

    expect(await screen.findByText('Choose a password different from the temporary one.')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  // Three password fields on one screen — revealing the one being checked
  // must not put the other two on screen alongside it.
  it('reveals each password field independently', async () => {
    const user = userEvent.setup()
    renderPage()

    const fields = ['Temporary password', 'New password', 'Confirm password']
    for (const label of fields) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
    }

    await user.click(screen.getAllByRole('button', { name: 'Show password' })[1])

    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Temporary password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
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
