import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps routes that require a logged-in, approved user.
 * - Not logged in                     -> redirect to /login
 * - Intern/registrar not yet onboarded -> redirect to /welcome
 * - Still on an admin-issued password  -> redirect to /set-password
 * - Logged in, not approved           -> show PendingApprovalPage content (via App.jsx routing)
 * - adminOnly=true and user is not admin -> redirect to home
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { session, profile, loading, isAdmin, isApproved, mustChangePassword, needsOnboarding } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Onboarding comes first because it CONTAINS the password step — an
  // intern arriving on an admin-issued password does the whole thing in
  // one place rather than being bounced to /set-password and back.
  // Everyone else who still holds an admin-issued password (an MO, or
  // anyone whose password was regenerated after onboarding) falls through
  // to the standalone screen below.
  if (needsOnboarding) {
    return <Navigate to="/welcome" replace />
  }

  // Ahead of the approval check on purpose: this is the single choke point
  // that makes the forced password change unskippable, so it has to catch
  // every authenticated route before any of them can render, and before
  // any other redirect can route around it.
  if (mustChangePassword) {
    return <Navigate to="/set-password" replace />
  }

  if (!isApproved) {
    return <Navigate to="/pending" replace />
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />
  }

  if (!profile) {
    return <Navigate to="/pending" replace />
  }

  return children
}
