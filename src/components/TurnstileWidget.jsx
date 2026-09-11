import { forwardRef } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { useTheme } from '../context/ThemeContext'
import { DARK_THEME } from '../lib/themes'

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
  const { theme } = useTheme()
  if (!SITE_KEY) return null
  const widgetTheme = theme === DARK_THEME ? 'dark' : 'light'
  return (
    <Turnstile
      // Cloudflare reads the theme when it renders the widget into its
      // iframe, so a changed option does not repaint an existing one. The
      // key remounts it instead — the cost is a fresh token, which is no
      // loss: a token is single-use and nobody switches theme mid-submit.
      key={widgetTheme}
      ref={ref}
      siteKey={SITE_KEY}
      onSuccess={onVerify}
      onExpire={onExpire}
      // Follows the app's own theme rather than Turnstile's "auto", which
      // keys off the OS and so showed a dark box on the light forms (and
      // would show a white one on the dark theme for anyone whose device
      // says light). "flexible" stretches it to the width of the inputs
      // around it instead of sitting as a fixed 300px block.
      options={{ theme: widgetTheme, size: 'flexible' }}
    />
  )
})

export default TurnstileWidget
