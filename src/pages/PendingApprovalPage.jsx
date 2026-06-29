import { useAuth } from '../context/AuthContext'

export default function PendingApprovalPage() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm text-center">
        <div className="card p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-flagAmber-bg">
            <svg className="h-6 w-6 text-flagAmber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="font-display text-xl text-ink">
            Hi {profile?.name || 'there'}, your account is awaiting approval
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            An admin needs to approve your account and link it to your staff record
            before you can access the roster. You'll receive a notification once
            that's done.
          </p>
          <button onClick={signOut} className="btn-secondary mt-6">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
