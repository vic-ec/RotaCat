import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

const { authState } = vi.hoisted(() => ({ authState: { current: {} } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => authState.current }))

function renderAt(auth, { adminOnly = false } = {}) {
  authState.current = auth
  return render(
    <MemoryRouter initialEntries={['/staff']}>
      <Routes>
        <Route path="/staff" element={<ProtectedRoute adminOnly={adminOnly}><p>Staff list</p></ProtectedRoute>} />
        <Route path="/login" element={<p>Login</p>} />
        <Route path="/pending" element={<p>Pending</p>} />
        <Route path="/set-password" element={<p>Set password</p>} />
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>
  )
}

const APPROVED = {
  session: { user: { id: 'u1' } },
  profile: { id: 'u1' },
  loading: false,
  isAdmin: false,
  isApproved: true,
  mustChangePassword: false,
}

describe('ProtectedRoute', () => {
  it('lets an approved user through', () => {
    renderAt(APPROVED)
    expect(screen.getByText('Staff list')).toBeInTheDocument()
  })

  it('sends a signed-out visitor to login', () => {
    renderAt({ ...APPROVED, session: null, profile: null, isApproved: false })
    expect(screen.getByText('Login')).toBeInTheDocument()
  })

  it('sends an unapproved user to the pending page', () => {
    renderAt({ ...APPROVED, isApproved: false })
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  // This is the single choke point that makes the forced password change
  // unskippable — every authenticated route runs through it.
  it('sends anyone still on an admin-issued password to /set-password', () => {
    renderAt({ ...APPROVED, mustChangePassword: true })
    expect(screen.getByText('Set password')).toBeInTheDocument()
    expect(screen.queryByText('Staff list')).not.toBeInTheDocument()
  })

  // An admin-created account is approved from the start, but the check
  // ordering matters for a regenerated password on an account that is
  // pending for some other reason: the credential gate still wins, so the
  // pending page can never be used to sit on an admin-issued password.
  it('puts the password gate ahead of the approval gate', () => {
    renderAt({ ...APPROVED, isApproved: false, mustChangePassword: true })
    expect(screen.getByText('Set password')).toBeInTheDocument()
  })

  it('keeps a non-admin out of an admin-only route', () => {
    renderAt(APPROVED, { adminOnly: true })
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders nothing while the session is still resolving', () => {
    const { container } = renderAt({ ...APPROVED, loading: true })
    expect(container.textContent).toContain('Loading')
  })
})
