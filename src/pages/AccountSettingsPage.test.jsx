import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AccountSettingsPage from './AccountSettingsPage'

// A small safety net over the page's main paths — your own account (loads,
// mobile number, password, notifications) and the two ways of viewing
// someone else's (admin, non-admin). The admin-credentials and delete
// flows have test files of their own.

const auth = vi.hoisted(() => ({ current: null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ choice: 'system', setTheme: vi.fn(), choices: [] }),
}))
vi.mock('../lib/staffCredentials', () => ({
  changeStaffEmail: vi.fn(), regenerateStaffPassword: vi.fn(), deleteStaffAccount: vi.fn(),
}))

const ME = {
  id: 'me-1', name: 'Dana', surname: 'Doctor', role: 'doctor', category: 'MO', is_approved: true,
  is_active: true, is_admin: false, phone: '0821234567', birthday: null, color_code: '#0F766E',
  notification_prefs: { roster_published: true, leave_approved: true },
}
const OTHER = {
  id: 'p2', name: 'Olu', surname: 'Other', role: 'doctor', category: 'MO', is_approved: true,
  is_active: true, is_admin: false, phone: null, birthday: null, notification_prefs: {},
}

// Every write is recorded as [table, payload, filters].
const { writes } = vi.hoisted(() => ({ writes: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'me-1' } } }),
      signInWithPassword: () => Promise.resolve({ error: null }),
      updateUser: () => Promise.resolve({ error: null }),
    },
    rpc(name) {
      if (name === 'get_staff_emails') return Promise.resolve({ data: [{ id: 'p2', email: 'olu@example.com' }], error: null })
      return Promise.resolve({ data: [], error: null })
    },
    from(table) {
      let payload = null
      const filters = []
      const builder = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') {
            if (payload) writes.push([table, payload, filters])
            return (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
          }
          if (prop === 'update' || prop === 'insert' || prop === 'upsert') return p => { payload = p; return builder }
          if (prop === 'eq') return (col, val) => { filters.push([col, val]); return builder }
          if (prop === 'maybeSingle' || prop === 'single') {
            return () => Promise.resolve(table === 'profiles' ? { data: OTHER, error: null } : { data: null, error: null })
          }
          return () => builder
        },
      })
      return builder
    },
  },
}))

function signInAs({ isAdmin = false } = {}) {
  auth.current = {
    user: { id: 'me-1', email: 'dana@example.com' },
    profile: { ...ME, is_admin: isAdmin },
    isAdmin, isSuperAdmin: false, isLocum: false, isClerk: false,
    refreshProfile: vi.fn(), signOut: vi.fn(),
  }
}

function renderPage(path = '/account') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account" element={<AccountSettingsPage />} />
        <Route path="/account/:id" element={<AccountSettingsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { writes.length = 0 })

describe('AccountSettingsPage — your own account', () => {
  it('loads with your name, contact details and every section', async () => {
    signInAs()
    renderPage()
    expect(await screen.findByText('Dana Doctor')).toBeInTheDocument()
    expect(screen.getByText('dana@example.com')).toBeInTheDocument()
    expect(screen.getByText('Contact Details')).toBeInTheDocument()
    expect(screen.getByText('Security & Access')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change password/ })).toBeInTheDocument()
    expect(screen.getByText('Preferences')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Appearance/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Notifications/ })).toBeInTheDocument()
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete Account/ })).toBeInTheDocument()
  })

  it('saves a changed mobile number to your profile', async () => {
    signInAs()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Dana Doctor')
    await user.click(screen.getByRole('button', { name: 'Edit mobile number' }))
    const input = screen.getByPlaceholderText('e.g. (082) 123 4567')
    await user.clear(input)
    await user.type(input, '0831112222')
    await user.click(screen.getByRole('button', { name: 'Update' }))
    expect(writes).toContainEqual(['profiles', { phone: '0831112222' }, [['id', 'me-1']]])
  })

  it('asks for the current password before changing it', async () => {
    signInAs()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Dana Doctor')
    await user.click(screen.getByRole('button', { name: /Change password/ }))
    await user.type(screen.getByPlaceholderText('Enter new password'), 'Another-Pass-2026')
    await user.click(screen.getByRole('button', { name: 'Update' }))
    expect(await screen.findByText('Enter your current password.')).toBeInTheDocument()
  })

  it('a notification group switch saves your preferences', async () => {
    signInAs()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Dana Doctor')
    await user.click(screen.getByRole('button', { name: /Notifications/ }))
    const roster = screen.getByText('Roster').closest('div')
    await user.click(roster.querySelector('[role="switch"]'))
    expect(writes).toContainEqual(['profiles', { notification_prefs: { roster_published: false, leave_approved: true } }, [['id', 'me-1']]])
  })
})

describe('AccountSettingsPage — someone else’s account', () => {
  it('an admin sees their Role & Access, Regenerate password and the delete zone, not your preferences', async () => {
    signInAs({ isAdmin: true })
    renderPage('/account/p2')
    expect(await screen.findByText('Olu Other')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Role & Access/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Regenerate password/ })).toBeInTheDocument()
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
    expect(screen.queryByText('Preferences')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Change password/ })).not.toBeInTheDocument()
  })

  it('a non-admin sees their contact details only — no role, no admin actions', async () => {
    signInAs()
    renderPage('/account/p2')
    expect(await screen.findByText('Olu Other')).toBeInTheDocument()
    expect(await screen.findByText('olu@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Role & Access/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit mobile number' })).not.toBeInTheDocument()
  })
})
