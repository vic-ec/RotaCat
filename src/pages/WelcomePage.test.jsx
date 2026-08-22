import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import WelcomePage from './WelcomePage'

const { authState, submitOnboarding, fetchOwnRotations, profileUpdates, updateUser } = vi.hoisted(() => ({
  authState: { current: {} },
  submitOnboarding: vi.fn(),
  fetchOwnRotations: vi.fn(),
  profileUpdates: [],
  updateUser: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState.current }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser,
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'new@example.com' } } }),
    },
    from(table) {
      const builder = {
        update(payload) { profileUpdates.push({ table, payload }); return builder },
        eq: () => Promise.resolve({ error: null }),
      }
      return builder
    },
  },
}))
vi.mock('../lib/onboarding', async importOriginal => ({
  ...(await importOriginal()),
  submitOnboarding,
  fetchOwnRotations,
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/welcome']}>
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>
  )
}

function setDate(label, value, index = 0) {
  fireEvent.change(screen.getAllByLabelText(label)[index], { target: { value } })
}

describe('WelcomePage', () => {
  beforeEach(() => {
    profileUpdates.length = 0
    submitOnboarding.mockReset().mockResolvedValue({ ok: true })
    fetchOwnRotations.mockReset().mockResolvedValue([])
    updateUser.mockReset().mockResolvedValue({ error: null })
    authState.current = {
      profile: { id: 'u1', name: 'Ivy', surname: 'Intern', phone: '0821234567', category: 'Intern', role: 'doctor' },
      user: { email: 'ivy@example.com' },
      mustChangePassword: false,
      needsOnboarding: true,
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      changeEmail: vi.fn().mockResolvedValue({ error: null }),
      verifyEmailChangeOtp: vi.fn().mockResolvedValue({ error: null }),
    }
  })

  it('files the rotation plan and the mobile number together, then goes to the dashboard', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Continue' }))       // details step
    await screen.findByText(/Set out your rotation blocks/)

    setDate('From', '2026-09-01')
    setDate('To', '2026-10-31')
    await user.click(screen.getByRole('button', { name: /Finish and go to my dashboard/ }))

    await waitFor(() => expect(submitOnboarding).toHaveBeenCalledTimes(1))
    expect(submitOnboarding).toHaveBeenCalledWith({
      phone: '0821234567',
      rotations: [{ rotation_type: 'EC', subtype: null, start_date: '2026-09-01', end_date: '2026-10-31' }],
    })
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  // The password step only exists for someone who arrived on a password an
  // admin generated — a self-registered intern picked their own already.
  it('opens on the password step only when one is still admin-issued', async () => {
    renderPage()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()

    authState.current = { ...authState.current, mustChangePassword: true }
    renderPage()
    expect(screen.getAllByLabelText('New password')[0]).toBeInTheDocument()
  })

  it('clears the password flag only after the password itself changed', async () => {
    authState.current = { ...authState.current, mustChangePassword: true }
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('New password'), 'Str0ng!Passw0rd')
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd')
    await user.click(screen.getByRole('button', { name: /Save password and continue/ }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'Str0ng!Passw0rd' }))
    expect(profileUpdates).toContainEqual({ table: 'profiles', payload: { must_change_password: false } })
  })

  it('does not clear the flag when the password change fails', async () => {
    authState.current = { ...authState.current, mustChangePassword: true }
    updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('New password'), 'Str0ng!Passw0rd')
    await user.type(screen.getByLabelText('Confirm password'), 'Str0ng!Passw0rd')
    await user.click(screen.getByRole('button', { name: /Save password and continue/ }))

    expect(await screen.findByText('New password should be different from the old password.')).toBeInTheDocument()
    expect(profileUpdates).toEqual([])
  })

  // The form replaces this person's blocks wholesale, so anything an admin
  // already entered has to be on screen — otherwise finishing the form
  // would silently delete it.
  it('pre-fills the rotation step from blocks already on file', async () => {
    fetchOwnRotations.mockResolvedValue([
      { rotation_type: 'OT', subtype: 'PSYCH', start_date: '2026-09-01', end_date: '2026-10-31' },
    ])
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('OT · Psych')).toBeInTheDocument()
    // Asserted on the underlying date inputs rather than the button's
    // formatted label, which varies with the ICU build's en-GB month
    // abbreviations (Sep vs Sept).
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01')
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-31')
  })

  it('refuses overlapping rotations before calling the server', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await screen.findByText(/Set out your rotation blocks/)

    setDate('From', '2026-09-01')
    setDate('To', '2026-10-31')
    await user.click(screen.getByRole('button', { name: /Add another rotation/ }))
    setDate('From', '2026-10-01', 1)
    setDate('To', '2026-11-30', 1)

    await user.click(screen.getByRole('button', { name: /Finish and go to my dashboard/ }))
    expect(await screen.findByText(/overlap/)).toBeInTheDocument()
    expect(submitOnboarding).not.toHaveBeenCalled()
  })

  it('surfaces a server-side rejection instead of moving on', async () => {
    submitOnboarding.mockResolvedValue({ ok: false, error: 'Onboarding has already been completed for this account.' })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    setDate('From', '2026-09-01')
    setDate('To', '2026-10-31')
    await user.click(screen.getByRole('button', { name: /Finish and go to my dashboard/ }))

    expect(await screen.findByText('Onboarding has already been completed for this account.')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  // A registrar's placement is always EC — offering a one-option dropdown
  // would be noise, and an OT block from them is rejected server-side.
  it('states EC for a registrar rather than offering a choice', async () => {
    authState.current = {
      ...authState.current,
      profile: { ...authState.current.profile, category: 'Registrar' },
    }
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Emergency Centre (EC)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /OT · Psych/ })).not.toBeInTheDocument()
  })

  it('blocks the details step while an email change is still unconfirmed', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Change' }))
    await user.type(screen.getByPlaceholderText('new.address@example.com'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    await screen.findByText(/Enter the 6-digit code/)

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/Finish confirming your new email address/)).toBeInTheDocument()
  })

  it('confirms an email change with the code sent to the new address', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Change' }))
    await user.type(screen.getByPlaceholderText('new.address@example.com'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    await user.type(await screen.findByPlaceholderText('123456'), '123456')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Email address updated.')).toBeInTheDocument()
    expect(authState.current.verifyEmailChangeOtp).toHaveBeenCalledWith('new@example.com', '123456')
  })

  it('sends anyone who has already onboarded back to the app', () => {
    authState.current = { ...authState.current, needsOnboarding: false }
    renderPage()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
