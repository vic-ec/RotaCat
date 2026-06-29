import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps routes that require a logged-in, approved user.
 * - Not logged in           -> redirect to /login
 * - Logged in, not approved -> show PendingApprovalPage content (via App.jsx routing)
 * - adminOnly=true and user is not admin -> redirect to home
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { session, profile, loading, isAdmin, isApproved } = useAuth()

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
