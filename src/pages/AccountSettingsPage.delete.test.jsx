import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AccountSettingsPage from './AccountSettingsPage'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', email: 'admin@example.com' },
    profile: { id: 'admin-1', name: 'Ada', surname: 'Admin', role: 'admin', is_admin: true },
    isAdmin: true, isLocum: false, isClerk: false, isSuperAdmin: false,
    refreshProfile: vi.fn(), signOut: vi.fn(),
  }),
}))
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ choice: 'system', setTheme: vi.fn(), choices: [] }),
}))

const deleteStaffAccount = vi.fn()
vi.mock('../lib/staffCredentials', () => ({
  deleteStaffAccount: (...a) => deleteStaffAccount(...a),
}))

const TARGET = {
  id: 'p2', name: 'Lucy', surname: 'Locum', role: 'locum', category: 'Locum',
  contract_type: 'full', is_admin: false, is_approved: true, is_active: true,
  birthday: null, notification_prefs: {},
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'admin-1' } } }) },
    rpc() { return Promise.resolve({ data: [], error: null }) },
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account/p2']}>
      <Routes>
        <Route path="/account/:id" element={<AccountSettingsPage />} />
        <Route path="/staff" element={<div>StaffListStub</div>} />
      </Routes>
    </MemoryRouter>
  )
}

async function openDangerZone(user) {
  // The Danger Zone row is collapsed by default: expand it, then click the
  // inner "Delete account" button that reveals the confirmation step.
  await user.click(await screen.findByRole('button', { name: 'Delete account', expanded: false }))
  const inner = screen.getAllByRole('button', { name: 'Delete account' }).find(b => !b.hasAttribute('aria-expanded'))
  await user.click(inner)
  return screen.getByLabelText(/Type .* to confirm/)
}

describe('admin Delete account safeguards', () => {
  beforeEach(() => { deleteStaffAccount.mockReset(); deleteStaffAccount.mockResolvedValue({ ok: true }) })
  afterEach(() => { vi.useRealTimers() })

  // The seam under the header used to be the page's slate hairline, which
  // read as a stray teal line across an otherwise red panel.
  it('draws the seam under the header in the card\'s own danger colour', async () => {
    const user = userEvent.setup()
    renderPage()
    const header = await screen.findByRole('button', { name: 'Delete account', expanded: false })
    await user.click(header)

    const body = header.nextElementSibling
    expect(body.className).toContain('border-danger/40')
    expect(body.className).not.toContain('border-slate-line')
  })

  it('keeps Delete disabled until the surname is typed (case and spaces ignored)', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = await openDangerZone(user)
    const confirm = screen.getAllByRole('button', { name: 'Delete account' }).find(b => !b.hasAttribute('aria-expanded'))
    expect(confirm).toBeDisabled()

    await user.type(input, 'Locu')
    expect(confirm).toBeDisabled()

    await user.type(input, 'm')
    expect(confirm).toBeEnabled()

    await user.clear(input)
    await user.type(input, '  locum ')
    expect(confirm).toBeEnabled()
  })

  it('Undo during the countdown cancels without calling the server', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    const input = await openDangerZone(user)
    await user.type(input, 'Locum')
    await user.click(screen.getAllByRole('button', { name: 'Delete account' }).find(b => !b.hasAttribute('aria-expanded')))

    expect(screen.getByRole('status')).toHaveTextContent('in 10 seconds')
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.getByRole('status')).toHaveTextContent('in 7 seconds')

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await act(async () => { vi.advanceTimersByTime(20000) })

    expect(deleteStaffAccount).not.toHaveBeenCalled()
    // Back at step 1, surname still filled in so a changed mind is cheap.
    expect(screen.getByLabelText(/Type .* to confirm/)).toHaveValue('Locum')
  })

  it('deletes once the countdown runs out, then returns to the Staff list', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()
    const input = await openDangerZone(user)
    await user.type(input, 'Locum')
    await user.click(screen.getAllByRole('button', { name: 'Delete account' }).find(b => !b.hasAttribute('aria-expanded')))

    await act(async () => { vi.advanceTimersByTime(9000) })
    expect(deleteStaffAccount).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1000) })

    expect(deleteStaffAccount).toHaveBeenCalledWith('p2')
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByText('StaffListStub')).toBeInTheDocument())
  })

  it('unmounting during the countdown cancels the delete', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { unmount } = renderPage()
    const input = await openDangerZone(user)
    await user.type(input, 'Locum')
    await user.click(screen.getAllByRole('button', { name: 'Delete account' }).find(b => !b.hasAttribute('aria-expanded')))

    unmount()
    await act(async () => { vi.advanceTimersByTime(20000) })
    expect(deleteStaffAccount).not.toHaveBeenCalled()
  })
})
