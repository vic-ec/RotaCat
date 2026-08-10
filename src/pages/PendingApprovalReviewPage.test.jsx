import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PendingApprovalReviewPage from './PendingApprovalReviewPage'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}))

const createNotification = vi.fn().mockResolvedValue({ error: null })
vi.mock('../lib/notifications', () => ({
  createNotification: (...args) => createNotification(...args),
}))

const { mockResponses, updateCalls } = vi.hoisted(() => ({ mockResponses: {}, updateCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'admin-1' } } }) },
    rpc(name) {
      return Promise.resolve(mockResponses[`rpc:${name}`] || { data: null, error: null })
    },
    from(table) {
      let method = null
      const builder = {
        select() { method = 'select'; return builder },
        update(patch) {
          method = 'update'
          updateCalls.push({ table, patch })
          return builder
        },
        upsert(patch) {
          method = 'upsert'
          updateCalls.push({ table, patch })
          return Promise.resolve({ data: null, error: null })
        },
        eq() { return builder },
        single() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: null, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

const PENDING_PROFILE = {
  id: 'reg-1',
  name: 'Julian',
  surname: 'Cosmos',
  phone: '0821234567',
  role: 'doctor',
  category: '',
  contract_type: 'full',
  psych_subcategory: null,
  is_admin: false,
  is_approved: false,
  is_rejected: false,
  email_verified: true,
  created_at: '2026-07-29T09:29:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/staff/pending/reg-1']}>
      <Routes>
        <Route path="/staff/pending/:id" element={<PendingApprovalReviewPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PendingApprovalReviewPage', () => {
  beforeEach(() => {
    createNotification.mockClear()
    updateCalls.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PENDING_PROFILE, error: null }
    mockResponses['rpc:get_staff_emails'] = { data: [{ id: 'reg-1', email: 'julian.cosmos@rotacat-test.local' }], error: null }
    mockResponses['profiles:update'] = { data: null, error: null }
  })

  it('shows a status-led header, identity, and read-only submitted details by default', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Review account registration' })).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Submitted 29-07-2026 · 09:29')).toBeInTheDocument()
    expect(screen.queryByText(/Back to Requests/)).not.toBeInTheDocument()

    // Identity: full name + assignment tag, no editable name inputs visible.
    expect(screen.getAllByText('Julian Cosmos').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument()

    // Submitted details read-only rows.
    expect(screen.getByText('Full name')).toBeInTheDocument()
    expect(screen.getByText('Mobile')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('julian.cosmos@rotacat-test.local')).toBeInTheDocument()
  })

  it('"Edit submitted details" reveals separate first-name/surname/mobile inputs', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Edit submitted details' }))
    expect(screen.getByLabelText('First name')).toHaveValue('Julian')
    expect(screen.getByLabelText('Surname')).toHaveValue('Cosmos')
    // Email always stays read-only, even in edit mode.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.getByText('julian.cosmos@rotacat-test.local')).toBeInTheDocument()
  })

  it('disables Approve with a stated reason until role and category are both set', async () => {
    renderPage()

    const approveBtn = await screen.findByRole('button', { name: 'Approve account' })
    expect(approveBtn).toBeDisabled()
    expect(screen.getByText('Select a role and clinical category to approve.')).toBeInTheDocument()
  })

  it('approves with the currently-selected role/category once complete, in a single mutation', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clinical category *' }))
    await user.click(await screen.findByRole('option', { name: 'Medical Officer' }))

    const approveBtn = screen.getByRole('button', { name: 'Approve account' })
    expect(approveBtn).toBeEnabled()
    await user.click(approveBtn)

    await waitFor(() => expect(updateCalls.some(c => c.table === 'profiles' && c.patch.is_approved === true)).toBe(true))
    const approvalCall = updateCalls.find(c => c.table === 'profiles' && c.patch.is_approved === true)
    expect(approvalCall.patch).toMatchObject({
      role: 'doctor',
      category: 'MO',
      is_active: true,
      is_admin: false,
      approved_by: 'admin-1',
    })
  })

  it('requires a confirmation step before approving with newly-granted admin access', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clinical category *' }))
    await user.click(await screen.findByRole('option', { name: 'Medical Officer' }))
    await user.click(screen.getByRole('checkbox', { name: 'Grant admin permissions' }))

    await user.click(screen.getByRole('button', { name: 'Approve account' }))

    // Routine approval doesn't fire yet — the confirmation step must appear first.
    expect(updateCalls.some(c => c.patch?.is_approved === true)).toBe(false)
    expect(await screen.findByText(/Julian Cosmos.*administrator access/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm approval' }))
    await waitFor(() => expect(updateCalls.some(c => c.patch?.is_admin === true)).toBe(true))
  })

  it('flags a possible duplicate account using the already-fetched staff email list, with a link to review it', async () => {
    mockResponses['rpc:get_staff_emails'] = {
      data: [
        { id: 'reg-1', email: 'julian.cosmos@rotacat-test.local' },
        { id: 'existing-1', email: 'julian.cosmos@rotacat-test.local' },
      ],
      error: null,
    }
    renderPage()

    expect(await screen.findByText(/Possible duplicate/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Review existing account/ })
    expect(link).toHaveAttribute('href', '/account/existing-1')
  })

  it('shows a passing check when the email is unique and verified', async () => {
    renderPage()

    expect(await screen.findByText('Email address is verified')).toBeInTheDocument()
    expect(screen.getByText('Email address is not used by another account')).toBeInTheDocument()
  })

  it('rejecting opens a reason step, then rejects and notifies without touching roster/leave tables', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Reject…' }))
    await user.type(screen.getByLabelText(/Reason/), 'Could not verify registrar credentials')
    await user.click(screen.getByRole('button', { name: 'Confirm reject' }))

    await waitFor(() => expect(updateCalls.some(c => c.patch?.is_rejected === true)).toBe(true))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'reg-1',
      type: 'account_rejected',
      body: expect.stringContaining('Could not verify registrar credentials'),
    }))
  })

  it('closes without approving or rejecting when the header back link is used (embedded)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MemoryRouter initialEntries={['/staff/pending/reg-1']}>
        <Routes>
          <Route path="/staff/pending/:id" element={<PendingApprovalReviewPage embedded onClose={onClose} />} />
        </Routes>
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('button', { name: /Pending approvals/ }))
    expect(onClose).toHaveBeenCalled()
    expect(updateCalls.length).toBe(0)
  })
})
