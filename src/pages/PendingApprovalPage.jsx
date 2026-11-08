import { useAuth } from '../context/AuthContext'
import AuthFooter from '../components/AuthFooter'
import { AUTH_PANEL, AUTH_BUTTON_OUTLINE } from '../lib/authStyles'

// Where an approved-but-not-yet-vetted registration lands. Framed like the
// other unauthenticated screens: one white panel on the brushed page.
export default function PendingApprovalPage() {
  const { profile, signOut } = useAuth()

  return (
    <div className="auth-page flex min-h-dvh flex-col items-center justify-center px-4">
      <div className={`w-full max-w-sm p-8 text-center ${AUTH_PANEL}`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-flagAmber-bg">
          <svg className="h-6 w-6 text-flagAmber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="font-display text-xl font-bold text-ink">
          Hi {profile?.name || 'there'}, your account is awaiting approval
        </h2>
        <p className="mt-2 text-sm text-ink-light">
          An admin needs to approve your account and link it to your staff record
          before you can access the roster. You&apos;ll receive a notification once
          that&apos;s done.
        </p>
        <button type="button" onClick={signOut} className={`${AUTH_BUTTON_OUTLINE} mt-6`}>
          Sign out
        </button>
      </div>
      <AuthFooter onSheen />
    </div>
  )
}
