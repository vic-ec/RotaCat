import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthField from './AuthField'
import { authButtonClass, AUTH_LINK, AUTH_LINK_MUTED, AUTH_ERROR } from '../lib/authStyles'

// The "enter the 6-digit code we emailed you" step, shared by the two
// places it is needed: right after registering (the Create-account modal's
// success state) and when someone who skipped it comes back to sign in
// and is told "Email not confirmed" (the login page's Confirm-your-email
// dialog). One form, so the two cannot drift.
//
// `sendOnMount` asks Supabase for a fresh code as soon as the form appears
// — for the sign-in path, where the original code is long gone. The
// registration path leaves it off: signUp has just sent one.
// `onConfirmed` runs once the code is accepted; the caller decides where
// to go (both currently land on the dashboard, since verifyOtp signs the
// person in).
export default function ConfirmEmailForm({ email, onConfirmed, sendOnMount = false, showBackLink = true }) {
  const { verifySignupOtp, resendSignupOtp } = useAuth()
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [sendError, setSendError] = useState('')
  const sentOnMount = useRef(false)

  useEffect(() => {
    if (!sendOnMount || sentOnMount.current) return
    sentOnMount.current = true
    resendSignupOtp(email).then(({ error }) => {
      if (error) setSendError(error.message && error.message !== '{}' ? error.message : 'We could not send a code. Please try again.')
    })
    // resendSignupOtp is stable for the life of the provider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, sendOnMount])

  async function handleVerify(e) {
    e.preventDefault()
    setOtpError('')
    setVerifying(true)
    const { error } = await verifySignupOtp(email, otp)
    setVerifying(false)
    if (error) {
      setOtpError(error.message && error.message !== '{}' ? error.message : 'Something went wrong. Please try again.')
      return
    }
    onConfirmed?.()
  }

  async function handleResend() {
    setResending(true)
    setResent(false)
    setSendError('')
    const { error } = await resendSignupOtp(email)
    setResending(false)
    if (error) setSendError(error.message && error.message !== '{}' ? error.message : 'We could not send a code. Please try again.')
    else setResent(true)
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
        <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-sm text-ink-muted">
        We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>.
        Enter it below to confirm your address.
      </p>

      <form onSubmit={handleVerify} className="mt-4 text-left">
        <AuthField
          id="otp"
          label="Confirmation code"
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          controlClassName="text-center text-lg tracking-[0.3em] placeholder:tracking-normal"
        />

        {(otpError || sendError) && (
          <div role="alert" className={`mt-4 ${AUTH_ERROR}`}>
            {otpError || sendError}
          </div>
        )}

        <button
          type="submit"
          disabled={verifying || otp.length !== 6}
          className={authButtonClass({ large: false, extra: 'mt-4' })}
        >
          {verifying ? 'Confirming…' : 'Confirm email'}
        </button>
      </form>

      <button
        type="button"
        onClick={handleResend}
        disabled={resending}
        className={`mt-3 text-sm ${AUTH_LINK} disabled:opacity-60`}
      >
        {resending ? 'Resending…' : resent ? 'Code resent — check your email' : "Didn't get a code? Resend"}
      </button>

      {showBackLink && (
        <Link to="/login" className={`mt-6 block text-sm ${AUTH_LINK_MUTED}`}>
          Back to sign in
        </Link>
      )}
    </div>
  )
}
