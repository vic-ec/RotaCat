import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PendingApprovalSlideOverPanel from './PendingApprovalSlideOverPanel'

// This drawer is built on RequestReviewDrawer — the same shell the
// leave-request review drawer uses — specifically so the two presentations
// can't drift apart (a title/status/× header, a true flex-shrink-0
// footer, no separate "back to Pending approvals" link the leave drawer
// has no equivalent of). These tests check that shell wiring, not the
// review logic itself (see PendingApprovalReviewPage.test.jsx for that —
// both presentations share usePendingApprovalReview).
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
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
  name: 'Jordan',
  surname: 'Reyes',
  phone: '0821234567',
  role: 'doctor',
  category: 'MO',
  contract_type: 'full',
  psych_subcategory: null,
  is_admin: false,
  is_approved: false,
  is_rejected: false,
  email_verified: true,
  created_at: '2026-07-29T09:29:00.000Z',
}

function renderPanel(initialEntries = ['/staff/pending/reg-1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/staff/pending/:id" element={<PendingApprovalSlideOverPanel />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PendingApprovalSlideOverPanel', () => {
  beforeEach(() => {
    updateCalls.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['profiles:select'] = { data: PENDING_PROFILE, error: null }
    mockResponses['rpc:get_staff_emails'] = { data: [{ id: 'reg-1', email: 'jordan.reyes@rotacat-test.local' }], error: null }
    mockResponses['profiles:update'] = { data: null, error: null }
  })

  it('renders as a dialog with a status-led header and a × close — no separate back link', async () => {
    renderPanel()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Review account registration' })).toBeInTheDocument()
    expect(within(dialog).getByText('Pending review')).toBeInTheDocument()
    expect(within(dialog).getByText('Submitted 29-07-2026 · 09:29')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(within(dialog).queryByText(/Pending approvals/)).not.toBeInTheDocument()
  })

  it('the × close navigates away without approving or rejecting', async () => {
    const user = userEvent.setup()
    renderPanel()

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateCalls.length).toBe(0)
  })

  it('the footer is a true sibling of the body, not inside the scrollable area', async () => {
    renderPanel()

    const dialog = await screen.findByRole('dialog')
    const approveBtn = await within(dialog).findByRole('button', { name: 'Approve account' })
    // RequestReviewDrawer renders the footer in its own flex-shrink-0 strip,
    // a sibling of the flex-1 overflow-y-auto body — not stuck inside it.
    const footerStrip = approveBtn.closest('.flex-shrink-0')
    expect(footerStrip).not.toBeNull()
    expect(footerStrip.className).not.toMatch(/overflow-y-auto/)
  })

  it('approves and closes the drawer', async () => {
    const user = userEvent.setup()
    renderPanel()

    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Approve account' }))

    await waitFor(() => expect(updateCalls.some(c => c.table === 'profiles' && c.patch.is_approved === true)).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
