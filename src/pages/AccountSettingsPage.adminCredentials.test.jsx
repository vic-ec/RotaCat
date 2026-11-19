import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AccountSettingsPage from './AccountSettingsPage'
import { TEMP_PASSWORD_VALIDITY_DAYS } from '../lib/tempPassword'

// Who is signed in varies per test: an ordinary admin, the super-admin, or
// a non-admin doctor.
const auth = vi.hoisted(() => ({ current: null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ choice: 'system', setTheme: vi.fn(), choices: [] }),
}))

const { changeStaffEmail, regenerateStaffPassword } = vi.hoisted(() => ({
  changeStaffEmail: vi.fn(), regenerateStaffPassword: vi.fn(),
}))
vi.mock('../lib/staffCredentials', () => ({
  changeStaffEmail, regenerateStaffPassword, deleteStaffAccount: vi.fn(),
}))

const ME = { id: 'me-1', name: 'Ada', surname: 'Admin', role: 'doctor', category: 'MO', is_approved: true, is_active: true, notification_prefs: {} }
const TARGET = {
  id: 'p2', name: 'Lucy', surname: 'Locum', role: 'locum', category: 'MO',
  contract_type: 'full', is_admin: false, is_approved: true, is_active: true,
  birthday: null, notification_prefs: {}, email_verified: false,
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'me-1' } } }) },
    rpc(name) {
      if (name === 'get_staff_emails') {
        return Promise.resolve({ data: [{ id: 'p2', email: 'placeholder@example.com' }], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    },
    from(table) {
      const builder = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') {
            return (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return () => Promise.resolve(table === 'profiles' ? { data: TARGET, error: null } : { data: null, error: null })
          }
          return () => builder
        },
      })
      return builder
    },
  },
}))

function signInAs({ isAdmin = false, isSuperAdmin = false } = {}) {
  auth.current = {
    user: { id: 'me-1', email: 'me@example.com' },
    profile: { ...ME, is_admin: isAdmin, is_super_admin: isSuperAdmin },
    isAdmin, isSuperAdmin, isLocum: false, isClerk: false,
    refreshProfile: vi.fn(), signOut: vi.fn(),
  }
}

function renderPage(path = '/account/p2') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account" element={<AccountSettingsPage />} />
        <Route path="/account/:id" element={<AccountSettingsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

async function openEmailEditor(user) {
  await screen.findByText('placeholder@example.com')
  await user.click(screen.getByRole('button', { name: 'Edit email address' }))
  return screen.getByLabelText('New email address')
}

beforeEach(() => {
  changeStaffEmail.mockReset()
  regenerateStaffPassword.mockReset()
  changeStaffEmail.mockResolvedValue({
    ok: true, profileId: 'p2', email: 'lucy@example.com', credentialsIssued: true, emailSent: true,
  })
})

describe('email row on someone else’s account', () => {
  it('is editable for the super-admin', async () => {
    signInAs({ isAdmin: true, isSuperAdmin: true })
    const user = userEvent.setup()
    renderPage()

    const input = await openEmailEditor(user)
    expect(input).toHaveValue('placeholder@example.com')
    expect(screen.getByText(/No confirmation email is sent/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Send login details to the new address/ })).toBeChecked()
    expect(screen.getByText(new RegExp(`valid for ${TEMP_PASSWORD_VALIDITY_DAYS} days`))).toBeInTheDocument()
  })

  it('is read-only for an admin who is not the super-admin', async () => {
    signInAs({ isAdmin: true })
    renderPage()

    await screen.findByText('placeholder@example.com')
    expect(screen.queryByRole('button', { name: 'Edit email address' })).not.toBeInTheDocument()
    // Mobile number editing is untouched: admins still have that pencil.
    expect(screen.getByRole('button', { name: 'Edit mobile number' })).toBeInTheDocument()
  })

  it('is read-only for a non-admin', async () => {
    signInAs()
    renderPage()

    await screen.findByText('placeholder@example.com')
    expect(screen.queryByRole('button', { name: 'Edit email address' })).not.toBeInTheDocument()
  })

  it('confirms before calling the function, then reports the change', async () => {
    signInAs({ isAdmin: true, isSuperAdmin: true })
    const user = userEvent.setup()
    renderPage()

    const input = await openEmailEditor(user)
    await user.clear(input)
    await user.type(input, 'Lucy@Example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = screen.getByRole('dialog', { name: 'Change email address' })
    expect(dialog).toHaveTextContent('Lucy Locum’s login email will change from placeholder@example.com to lucy@example.com.')
    expect(dialog).toHaveTextContent('A new temporary password will be emailed to lucy@example.com.')
    expect(changeStaffEmail).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Change email' }))
    expect(changeStaffEmail).toHaveBeenCalledWith('p2', 'lucy@example.com', true)

    const done = await screen.findByRole('dialog', { name: 'Email changed' })
    expect(done).toHaveTextContent('Email changed. Login details sent to lucy@example.com.')
    await user.click(within(done).getByRole('button', { name: 'Done' }))
    // The row now shows the new address, closed.
    expect(screen.getByText('lucy@example.com')).toBeInTheDocument()
    expect(screen.queryByLabelText('New email address')).not.toBeInTheDocument()
  })

  it('cancelling the confirmation changes nothing', async () => {
    signInAs({ isAdmin: true, isSuperAdmin: true })
    const user = userEvent.setup()
    renderPage()

    const input = await openEmailEditor(user)
    await user.clear(input)
    await user.type(input, 'lucy@example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(changeStaffEmail).not.toHaveBeenCalled()
    expect(screen.getByLabelText('New email address')).toHaveValue('lucy@example.com')
  })

  it('leaves the password alone when the box is unticked', async () => {
    changeStaffEmail.mockResolvedValue({ ok: true, profileId: 'p2', email: 'lucy@example.com', credentialsIssued: false })
    signInAs({ isAdmin: true, isSuperAdmin: true })
    const user = userEvent.setup()
    renderPage()

    const input = await openEmailEditor(user)
    await user.clear(input)
    await user.type(input, 'lucy@example.com')
    await user.click(screen.getByRole('checkbox', { name: /Send login details/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const dialog = screen.getByRole('dialog', { name: 'Change email address' })
    expect(dialog).not.toHaveTextContent('temporary password')
    await user.click(within(dialog).getByRole('button', { name: 'Change email' }))

    expect(changeStaffEmail).toHaveBeenCalledWith('p2', 'lucy@example.com', false)
    const done = await screen.findByRole('dialog', { name: 'Email changed' })
    expect(done).toHaveTextContent(/^.*Email changed\.(?! Login)/)
    expect(done).not.toHaveTextContent('Login details sent')
  })

  it('shows the password once when the login details could not be emailed', async () => {
    changeStaffEmail.mockResolvedValue({
      ok: true, profileId: 'p2', email: 'lucy@example.com', credentialsIssued: true,
      emailSent: false, emailError: 'Connection refused', password: 'Qw8$rtzPmn53',
    })
    signInAs({ isAdmin: true, isSuperAdmin: true })
    const user = userEvent.setup()
    renderPage()

    const input = await openEmailEditor(user)
    await user.clear(input)
    await user.type(input, 'lucy@example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Change email' }))

    const done = await screen.findByRole('dialog', { name: 'Email changed' })
    expect(within(done).getByText('Qw8$rtzPmn53')).toBeInTheDocument()
    expect(done).toHaveTextContent('Connection refused')
  })

  it('says so when the email changed but the password could not be issued', async () => {
    changeStaffEmail.mockResolvedValue({
      ok: true, profileId: 'p2', email: 'lucy@example.com', credentialsIssued: false,
      credentialsError: 'Email changed, but the password could not be issued. Use Regenerate password.',
    })
    signInAs({ isAdmin: true, isSuperAdmin: true })
    const user = userEvent.setup()
    renderPage()

    const input = await openEmailEditor(user)
    await user.clear(input)
    await user.type(input, 'lucy@example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Change email' }))

    expect(await screen.findByText('Email changed, but the password could not be issued. Use Regenerate password.')).toBeInTheDocument()
  })

  it('shows the function’s refusal inline and keeps the form open', async () => {
    changeStaffEmail.mockResolvedValue({ ok: false, error: 'An account with that email address already exists.' })
    signInAs({ isAdmin: true, isSuperAdmin: true })
    const user = userEvent.setup()
    renderPage()

    const input = await openEmailEditor(user)
    await user.clear(input)
    await user.type(input, 'taken@example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Change email' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with that email address already exists.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New email address')).toHaveValue('taken@example.com')
  })
})

describe('Regenerate password row', () => {
  // Opens underneath its own header, like every other section on this
  // page — not as a modal over it. (The Staff list's row menu still gets
  // the modal: a list row has nothing to open into.)
  it('expands inline, with the address, for an admin', async () => {
    signInAs({ isAdmin: true })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('placeholder@example.com')
    const header = screen.getByRole('button', { name: 'Regenerate password' })
    expect(header).toHaveAttribute('aria-expanded', 'false')

    await user.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('dialog', { name: 'Regenerate password' })).not.toBeInTheDocument()
    expect(screen.getByText(/issues Lucy a new temporary password and emails it/)).toBeInTheDocument()
    expect(screen.getByText('placeholder@example.com', { selector: 'strong' })).toBeInTheDocument()
    // Nothing happens until the admin confirms.
    expect(regenerateStaffPassword).not.toHaveBeenCalled()
  })

  // Every other section on this page leads with its button on the left;
  // right-aligned is the modal's shape, not an inline section's.
  it('puts its button on the left, like every other section', async () => {
    signInAs({ isAdmin: true })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('placeholder@example.com')
    await user.click(screen.getByRole('button', { name: 'Regenerate password' }))
    const actions = screen.getByRole('button', { name: 'Regenerate and email' }).parentElement
    expect(actions.className).not.toContain('justify-end')
  })

  it('issues the password on confirm, and says where it went', async () => {
    signInAs({ isAdmin: true })
    regenerateStaffPassword.mockResolvedValue({ ok: true, emailSent: true })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('placeholder@example.com')
    await user.click(screen.getByRole('button', { name: 'Regenerate password' }))
    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))

    expect(regenerateStaffPassword).toHaveBeenCalledWith('p2')
    expect(await screen.findByText('New password sent')).toBeInTheDocument()
  })

  it('is not offered to a non-admin', async () => {
    signInAs()
    renderPage()

    await screen.findByText('placeholder@example.com')
    expect(screen.queryByRole('button', { name: 'Regenerate password' })).not.toBeInTheDocument()
  })
})

describe('own account', () => {
  it('offers neither admin tool, even to the super-admin', async () => {
    signInAs({ isAdmin: true, isSuperAdmin: true })
    const user = userEvent.setup()
    renderPage('/account')

    await screen.findByText('me@example.com')
    expect(screen.queryByRole('button', { name: 'Regenerate password' })).not.toBeInTheDocument()

    // The email pencil is still there, but it is the self-service flow:
    // confirmation links, no "send login details".
    await user.click(screen.getByRole('button', { name: 'Edit email address' }))
    expect(screen.getByText(/sends confirmation links to both your old and new address/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Send login details/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
  })
})
