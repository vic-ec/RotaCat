import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth()

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl text-ink">
        Welcome, {profile?.name || 'there'}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {isAdmin
          ? 'Admin dashboard — roster generation tools coming in the next phase.'
          : 'Your upcoming shifts will appear here once the roster module is connected.'}
      </p>

      <div className="card mt-6 p-6">
        <p className="text-sm text-ink-light">
          This is the foundation screen for Phase 2. Once Phase 3 (roster engine) is
          built, this page will show {isAdmin ? "this month's generation status and pending leave approvals" : 'your next shifts and any pending swap requests'}.
        </p>
      </div>
    </div>
  )
}
