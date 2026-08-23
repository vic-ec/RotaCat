import { forwardRef } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

// Callers use this to decide whether a token is actually required before
// submitting — an environment without the site key set (e.g. local dev
// without it configured) renders no widget at all, so nothing should ever
// block on a token that can never arrive.
export const TURNSTILE_ENABLED = Boolean(SITE_KEY)

// Thin, shared wrapper around the Cloudflare Turnstile widget — Signup,
// Sign-in, and Forgot-password each need their own instance (Supabase's
// CAPTCHA protection setting, once enabled on the project, is enforced
// across all three endpoints together, not just signup), so this is just
// the one place that reads the site key from env and renders nothing
// (rather than crashing the form) if it's unset. `ref` exposes the
// underlying widget's `reset()`, used to get a fresh token after a
// failed submit — a Turnstile token is single-use.
const TurnstileWidget = forwardRef(function TurnstileWidget({ onVerify, onExpire }, ref) {
  if (!SITE_KEY) return null
  return <Turnstile ref={ref} siteKey={SITE_KEY} onSuccess={onVerify} onExpire={onExpire} />
})

export default TurnstileWidget
