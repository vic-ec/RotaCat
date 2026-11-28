import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StaffListPage from './StaffListPage'

// A small safety net over the Staff list's main paths: the list loads,
// grouped by category, with the Active / All Staff split and search; a
// non-admin gets the contact menu and no admin tabs; an admin gets the
// Requests tab and can approve a sign-up, and the status switch asks first.

const auth = vi.hoisted(() => ({ current: null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('../lib/locumCover', async () => ({ ...(await vi.importActual('../lib/locumCover')), fetchOpenLocumContacts: () => Promise.resolve([]) }))
vi.mock('../lib/internRotations', async () => ({ ...(await vi.importActual('../lib/internRotations')), fetchInternRotationsForDoctorIds: () => Promise.resolve([]) }))

const person = (id, name, surname, extra = {}) => ({
  id, name, surname, role: 'doctor', category: 'MO', is_active: true, is_approved: true, is_admin: false,
  phone: '0821234567', email_verified: true, ...extra,
})
const APPROVED = [
  person('p1', 'Ada', 'Nkosi'),
  person('p2', 'Ben', 'Zulu', { category: 'Registrar' }),
  person('p3', 'Cara', 'Oldman', { is_active: false }),
]
const PENDING = [person('n1', 'Nia', 'Newcomer', { is_approved: false, is_active: false, created_at: '2026-11-20T09:15:00' })]

// Every write is recorded as [table, payload, filters].
const { writes } = vi.hoisted(() => ({ writes: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'admin-1' } } }) },
    rpc(name) {
      if (name === 'get_staff_emails') return Promise.resolve({ data: APPROVED.map(p => ({ id: p.id, email: `${p.surname.toLowerCase()}@example.com` })), error: null })
      return Promise.resolve({ data: [], error: null })
    },
    from(table) {
      let payload = null
      const filters = []
      const builder = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') {
            if (payload) writes.push([table, payload, filters])
            let data = []
            if (table === 'profiles' && !payload) {
              data = filters.some(([c, v]) => c === 'is_approved' && v === false) ? PENDING : APPROVED
            }
            return (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject)
          }
          if (prop === 'update' || prop === 'insert' || prop === 'upsert') return p => { payload = p; return builder }
          if (prop === 'eq') return (col, val) => { filters.push([col, val]); return builder }
          if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve({ data: null, error: null })
          return () => builder
        },
      })
      return builder
    },
  },
}))

function signInAs({ isAdmin = false } = {}) {
  auth.current = { isAdmin, canViewStaffList: true }
}

function renderPage(path = '/staff') {
  return render(<MemoryRouter initialEntries={[path]}><StaffListPage /></MemoryRouter>)
}

// The list draws a phone layout and a desktop table side by side (one is
// hidden by CSS); the desktop table is the one with section panels.
// The page's tabs are plain buttons in the "Staff" navigation bar.
const tabs = () => screen.getByRole('navigation', { name: 'Staff' })
const tab = name => within(tabs()).getByRole('button', { name })

const desktop = () => screen.getAllByTestId('staff-section-panel')

beforeEach(() => { writes.length = 0 })

describe('StaffListPage — any viewer', () => {
  it('loads the active staff, grouped by category', async () => {
    signInAs()
    renderPage()
    await screen.findAllByText('Ada Nkosi')
    expect(tab('Active Staff')).toBeInTheDocument()
    expect(tab('All Staff')).toBeInTheDocument()
    expect(within(tabs()).queryByRole('button', { name: /Requests/ })).not.toBeInTheDocument()
    const panels = desktop()
    expect(panels).toHaveLength(2) // Registrar, then Medical Officer
    expect(within(panels[0]).getByText('Ben Zulu')).toBeInTheDocument()
    expect(within(panels[1]).getByText('Ada Nkosi')).toBeInTheDocument()
    // Inactive accounts are on All Staff only.
    expect(screen.queryAllByText('Cara Oldman')).toHaveLength(0)
  })

  it('All Staff includes inactive accounts', async () => {
    signInAs()
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('Ada Nkosi')
    await user.click(tab('All Staff'))
    expect((await screen.findAllByText('Cara Oldman')).length).toBeGreaterThan(0)
  })

  it('search narrows the list by name', async () => {
    signInAs()
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('Ada Nkosi')
    await user.type(screen.getAllByPlaceholderText('Surname or first name…')[0], 'zulu')
    expect(screen.getAllByText('Ben Zulu').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Ada Nkosi')).toHaveLength(0)
  })

  it('a non-admin opens a colleague’s contact menu: Message, Call and Mail only', async () => {
    signInAs()
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('Ada Nkosi')
    // The page's floating menu shares the "Quick actions" label; the row
    // kebabs are the ones that open a menu.
    const kebab = screen.getAllByRole('button', { name: 'Quick actions' }).find(b => b.getAttribute('aria-haspopup') === 'menu')
    await user.click(kebab)
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('button', { name: 'Message' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Call' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Mail' })).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
    expect(within(menu).queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
  })
})

describe('StaffListPage — admin', () => {
  it('approving a sign-up from Requests › New Users marks the profile approved', async () => {
    signInAs({ isAdmin: true })
    const user = userEvent.setup()
    renderPage('/staff?tab=pending')
    expect(await screen.findByText('Nia Newcomer')).toBeInTheDocument()
    expect(tab(/Requests/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve Nia Newcomer' }))
    const approval = writes.find(([table, p]) => table === 'profiles' && p.is_approved === true)
    expect(approval).toBeTruthy()
    expect(approval[2]).toContainEqual(['id', 'n1'])
  })

  it('the status switch asks before deactivating someone', async () => {
    signInAs({ isAdmin: true })
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('Ada Nkosi')
    const row = within(desktop()[1]).getByText('Ada Nkosi').closest('tr')
    await user.click(within(row).getByTitle('Click to deactivate'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(writes.filter(([t]) => t === 'profiles')).toHaveLength(0)
  })
})
